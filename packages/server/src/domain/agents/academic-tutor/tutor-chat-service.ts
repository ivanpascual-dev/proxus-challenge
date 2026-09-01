import { Context, Effect, Layer, Option, Queue, Ref, Stream } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import {
  ConversationNotFound,
  ConversationStorageError,
  LIMITS,
  LimitExceeded,
  type Conversation,
  type ConversationSummary,
  type TutorChatRequest,
  type TutorChatResponse,
  type TutorChatStreamEvent
} from "@proxus/shared";
import { ArtifactRepository } from "../../artifacts/artifact.ts";
import { MaterialRepository } from "../../materials/material.ts";
import { make as makeStudyProfileService, StudyProfileRepository } from "../../profile/study-profile.ts";
import { checkConversationHistoryLimit, conversationHistoryWarning } from "../../limits/chat-limits.ts";
import {
  AgentSession,
  renderScreenContext,
  SessionRepository,
  toPresentationMessages,
  type AgentSessionRunResult,
  type SessionNotFound,
  type SessionRepositoryError
} from "../harness/index.ts";
import { makeAcademicTutorHarness } from "../academic-tutor.ts";
import { initialTurnBudgetState } from "../../limits/turn-budget.ts";
import { RateLimiter } from "../../limits/rate-limiter.ts";

export interface TutorChatService {
  readonly sendMessage: (
    input: TutorChatRequest,
    clientKey: string
  ) => Effect.Effect<TutorChatResponse, ConversationNotFound | ConversationStorageError | LimitExceeded, LanguageModel.LanguageModel>;
  readonly streamMessage: (
    input: TutorChatRequest,
    clientKey: string
  ) => Stream.Stream<TutorChatStreamEvent, unknown, LanguageModel.LanguageModel>;
  readonly listConversations: () => Effect.Effect<readonly ConversationSummary[], ConversationStorageError>;
  readonly createConversation: () => Effect.Effect<ConversationSummary, LimitExceeded | ConversationStorageError>;
  readonly getConversation: (id: string) => Effect.Effect<Conversation, ConversationNotFound | ConversationStorageError>;
  readonly deleteConversation: (id: string) => Effect.Effect<void, ConversationNotFound | ConversationStorageError>;
}

export const TutorChatService = Context.Service<TutorChatService>(
  "@proxus/server/agents/academic-tutor/TutorChatService"
);

const storageError = () => new ConversationStorageError({
  message: "No se pudo completar la operación sobre la conversación. Vuelve a intentarlo en un momento."
});

// Todo lo que llega de `session-repository.ts` que no es "no existe" es un fallo de almacenamiento
// (disco ilegible, JSON corrupto, o el hueco astronómico de un id repetido): 500 declarado, nunca
// `orDie` (invariante 6).
const mapSessionError = (error: SessionRepositoryError | SessionNotFound): ConversationNotFound | ConversationStorageError =>
  error._tag === "SessionNotFound"
    ? new ConversationNotFound({
      conversationId: error.sessionId,
      message: `No hay ninguna conversación con id ${error.sessionId}.`
    })
    : storageError();

// `listSessions`/`makeSession` no pueden fallar por "conversación no encontrada" (no leen una
// conversación concreta): un mapeo dedicado evita que ese caso, imposible aquí, se cuele en el tipo
// del error declarado en `packages/shared`.
const mapStorageOnlyError = (_error: SessionRepositoryError): ConversationStorageError => storageError();

// `session.runTurn` puede fallar por algo que no es un error del modelo (ese ya lo captura
// `session.ts` y lo devuelve como parte de un turno normal, con su `error` de paso): un fallo aquí es
// un bug del arnés o de un comando, no algo que el contrato de la conversación pueda nombrar. Se
// declara como el mismo 500 de almacenamiento en vez de `orDie` (invariante 6).
const toInternalError = (reason: unknown): ConversationStorageError => new ConversationStorageError({
  message: `Fallo interno del agente al ejecutar el turno: ${formatUnknownReason(reason)}`
});

const formatUnknownReason = (reason: unknown): string => {
  if (typeof reason === "object" && reason !== null && "message" in reason && typeof reason.message === "string") {
    return reason.message;
  }
  return String(reason);
};

// Asunción A2: las primeras palabras del primer mensaje, recortadas. Sin llamada al modelo.
const deriveConversationTitle = (input: string): string =>
  input.trim().slice(0, LIMITS.maxConversationTitleCharacters);

export const TutorChatServiceLive = Layer.effect(
  TutorChatService,
  Effect.gen(function* () {
    const sessionRepository = yield* SessionRepository;
    const materialRepository = yield* MaterialRepository;
    const artifactRepository = yield* ArtifactRepository;
    const studyProfileRepository = yield* StudyProfileRepository;
    const rateLimiter = yield* RateLimiter;
    const studyProfileService = makeStudyProfileService(studyProfileRepository, artifactRepository, materialRepository);

    // El harness se construye por petición, con un presupuesto de turno fresco: dos peticiones no
    // comparten cuántas páginas o bytes de imagen les quedan. El limitador de frecuencia sí se
    // comparte entre peticiones (es lo que hace que la ventana deslizante cuente de verdad).
    const makeTurnHarness = (clientKey: string) => Effect.gen(function* () {
      const budgetRef = yield* Ref.make(initialTurnBudgetState);
      const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, studyProfileService, budgetRef, rateLimiter, clientKey);
      return { harness, session: AgentSession.make(harness) };
    });

    // Carga la conversación por `conversationId`, ejecuta el turno y guarda mensajes ya degradados
    // más su observabilidad (fase 4, decisión 6 y 7). `onMessage` deja vivir el turno en directo para
    // el camino de streaming, sin cambiar qué se persiste.
    const runTurn = (
      input: TutorChatRequest,
      clientKey: string,
      onMessage: Parameters<AgentSession["runTurn"]>[1]
    ): Effect.Effect<AgentSessionRunResult, ConversationNotFound | ConversationStorageError | LimitExceeded, LanguageModel.LanguageModel> => Effect.gen(function* () {
      const stored = yield* sessionRepository.getSession(input.conversationId).pipe(
        Effect.mapError(mapSessionError)
      );

      // El fusible de coste de la conversación entera (fusible, no control fino del turno): se
      // comprueba con el tamaño REAL de la última llamada conocida, antes de gastar otra llamada al
      // modelo con un historial que ya se sabe que se pasa (`chat-limits.ts`).
      const lastTurnInputTokens = stored.turns.at(-1)?.steps.at(-1)?.usage.inputTokens;
      const historyLimitExceeded = checkConversationHistoryLimit(lastTurnInputTokens);
      if (Option.isSome(historyLimitExceeded)) {
        return yield* historyLimitExceeded.value;
      }

      const { harness, session } = yield* makeTurnHarness(clientKey);
      const startedAt = new Date().toISOString();

      // Decisión 5 y 11: el contexto de pantalla viaja dentro del mensaje del usuario, nunca en el
      // system prompt. `ChatContextRef` solo lleva ids y título, así que anexarlo aquí nunca cuela
      // texto libre del material.
      const screenContext = renderScreenContext(input.context);
      const turnInput = screenContext === undefined ? input.input : `${input.input}\n\n${screenContext}`;

      // §5.1: lo que ve el navegador en directo (streaming) nunca es el mensaje `user` concatenado.
      // El primer mensaje que produce un turno es siempre ese `user` (harness/session.ts lo añade sin
      // condición, una vez); se sustituye su contenido por `input.input` antes de emitirlo, sin tocar
      // lo que `appendTurn` persiste para el historial que el modelo sigue usando como contexto.
      let leadingUserMessageMasked = false;
      const maskedOnMessage: typeof onMessage = (message) => {
        if (!leadingUserMessageMasked && message.role === "user") {
          leadingUserMessageMasked = true;
          return onMessage({ role: "user", content: input.input });
        }
        return onMessage(message);
      };

      const result = yield* session.runTurn(
        {
          input: turnInput,
          messages: stored.messages,
          maxSteps: input.maxSteps ?? LIMITS.maxAgentSteps
        },
        maskedOnMessage
      ).pipe(
        Effect.provide(harness.layer),
        Effect.mapError(toInternalError)
      );

      yield* sessionRepository.appendTurn({
        sessionId: input.conversationId,
        messages: result.newMessages,
        turn: {
          startedAt,
          steps: result.steps,
          input: input.input,
          context: input.context,
          messageCount: result.newMessages.length,
          followUpQuestions: result.followUpQuestions
        },
        title: stored.title.length === 0 ? deriveConversationTitle(input.input) : undefined
      }).pipe(Effect.mapError(mapSessionError));

      return result;
    });

    return {
      sendMessage: (input, clientKey) => Effect.gen(function* () {
        const result = yield* runTurn(input, clientKey, () => Effect.void);
        return { output: result.output };
      }),

      streamMessage: (input, clientKey) => Stream.callback<TutorChatStreamEvent, unknown, LanguageModel.LanguageModel>((queue) =>
        runTurn(input, clientKey, (message) =>
          Queue.offer(queue, { type: "message" as const, message }).pipe(Effect.asVoid)
        ).pipe(
          // El fusible de conversación llena es un rechazo esperado del dominio, no un fallo de
          // transporte: se emite como el mismo evento `error` que ya usan los fallos del modelo
          // (decisión 7), en vez de romper la conexión NDJSON a medias.
          Effect.catchTag("LimitExceeded", (error) =>
            Queue.offer(queue, { type: "error" as const, message: error.message }).pipe(Effect.as(null))
          ),
          Effect.tap((result) => result === null ? Effect.void : Effect.gen(function* () {
            const lastStep = result.steps.at(-1);
            if (lastStep?.error !== undefined) {
              yield* Queue.offer(queue, { type: "error" as const, message: lastStep.error.message });
              return;
            }

            if (result.followUpQuestions.length > 0) {
              yield* Queue.offer(queue, { type: "follow-up" as const, questions: result.followUpQuestions });
            }

            if (lastStep !== undefined && (lastStep.usage.inputTokens !== undefined || lastStep.usage.outputTokens !== undefined)) {
              yield* Queue.offer(queue, { type: "usage" as const, usage: lastStep.usage });
            }

            const warning = conversationHistoryWarning(lastStep?.usage.inputTokens);
            if (warning !== undefined) {
              yield* Queue.offer(queue, { type: "warning" as const, message: warning });
            }
          })),
          Effect.andThen(Queue.end(queue)),
          Effect.matchCauseEffect({
            onFailure: (cause) => Queue.failCause(queue, cause),
            onSuccess: () => Effect.void
          })
        )
      ),

      listConversations: () => sessionRepository.listSessions().pipe(Effect.mapError(mapStorageOnlyError)),

      createConversation: () => Effect.gen(function* () {
        const existing = yield* sessionRepository.listSessions().pipe(Effect.mapError(mapStorageOnlyError));
        if (existing.length >= LIMITS.maxConversations) {
          return yield* new LimitExceeded({
            limit: "maxConversations",
            ceiling: LIMITS.maxConversations,
            received: existing.length,
            message: `Ya tienes ${existing.length} conversaciones, el máximo es ${LIMITS.maxConversations}. Borra alguna para crear otra.`
          });
        }

        const session = yield* sessionRepository.makeSession({ id: crypto.randomUUID() }).pipe(
          Effect.mapError(mapStorageOnlyError)
        );

        return {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        };
      }),

      getConversation: (id) => sessionRepository.getSession(id).pipe(
        Effect.mapError(mapSessionError),
        Effect.map((session): Conversation => ({
          id: session.id,
          title: session.title,
          // §5.1: lo que recarga el navegador es la copia de presentación, no el historial que el
          // modelo usó como contexto. `session.messages` (usado en `runTurn`) no se toca aquí.
          messages: toPresentationMessages(session.messages, session.turns),
          turns: session.turns,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }))
      ),

      deleteConversation: (id) => sessionRepository.deleteSession(id).pipe(Effect.mapError(mapSessionError))
    };
  })
);

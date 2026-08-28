import { Context, Effect, Layer, Ref, Stream } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { LIMITS, type TutorChatRequest, type TutorChatResponse, type TutorChatStreamEvent } from "@proxus/shared";
import { ArtifactRepository } from "../../artifacts/artifact.ts";
import { MaterialRepository } from "../../materials/material.ts";
import { AgentSession } from "../harness/index.ts";
import { makeAcademicTutorHarness } from "../academic-tutor.ts";
import { initialTurnBudgetState } from "../../limits/turn-budget.ts";
import { RateLimiter } from "../../limits/rate-limiter.ts";

export interface TutorChatService {
  readonly sendMessage: (
    input: TutorChatRequest,
    clientKey: string
  ) => Effect.Effect<TutorChatResponse, unknown, LanguageModel.LanguageModel>;
  readonly streamMessage: (
    input: TutorChatRequest,
    clientKey: string
  ) => Stream.Stream<TutorChatStreamEvent, unknown, LanguageModel.LanguageModel>;
}

export const TutorChatService = Context.Service<TutorChatService>(
  "@proxus/server/agents/academic-tutor/TutorChatService"
);

export const TutorChatServiceLive = Layer.effect(
  TutorChatService,
  Effect.gen(function* () {
    const materialRepository = yield* MaterialRepository;
    const artifactRepository = yield* ArtifactRepository;
    const rateLimiter = yield* RateLimiter;

    const sessionInput = (input: TutorChatRequest) => ({
      input: input.input,
      messages: input.messages,
      maxSteps: input.maxSteps ?? LIMITS.maxAgentSteps
    });

    // El harness se construye por petición, con un presupuesto de turno fresco: dos peticiones no
    // comparten cuántas páginas o bytes de imagen les quedan. El limitador de frecuencia sí se
    // comparte entre peticiones (es lo que hace que la ventana deslizante cuente de verdad).
    const makeTurnHarness = (clientKey: string) => Effect.gen(function* () {
      const budgetRef = yield* Ref.make(initialTurnBudgetState);
      const harness = makeAcademicTutorHarness(materialRepository, artifactRepository, budgetRef, rateLimiter, clientKey);
      return { harness, session: AgentSession.make(harness) };
    });

    return {
      sendMessage: (input, clientKey) => Effect.gen(function* () {
        const { harness, session } = yield* makeTurnHarness(clientKey);
        return yield* session.run(sessionInput(input)).pipe(Effect.provide(harness.layer));
      }),
      streamMessage: (input, clientKey) => Stream.unwrap(
        makeTurnHarness(clientKey).pipe(Effect.map(({ harness, session }) =>
          session.stream(sessionInput(input)).pipe(
            Stream.map((message): TutorChatStreamEvent => ({ type: "message", message })),
            Stream.concat(Stream.succeed({ type: "done" as const })),
            Stream.provide(harness.layer)
          )
        ))
      )
    };
  })
);

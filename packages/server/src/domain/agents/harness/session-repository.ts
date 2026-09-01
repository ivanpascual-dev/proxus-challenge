import { Context, Data, Effect } from "effect";
import type { AgentMessage } from "./message.ts";

// La observabilidad por paso (fase 4, decisión 7): el coste y los errores del modelo viven en el
// modelo de sesión, no se disfrazan de mensaje del asistente. `usage` deja sus campos sin definir
// cuando el modelo no trajo `usageMetadata`: nunca se pinta un cero que finja ser un dato
// (invariante 3, F4-19).
export interface StoredStepUsage {
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

export interface StoredStepToolCall {
  readonly name: string;
  readonly input: unknown;
}

export interface StoredStepError {
  readonly message: string;
  readonly at: string;
}

export interface StoredStep {
  readonly index: number;
  readonly usage: StoredStepUsage;
  readonly toolCalls: readonly StoredStepToolCall[];
  readonly error?: StoredStepError | undefined;
}

export interface StoredTurn {
  readonly startedAt: string;
  readonly steps: readonly StoredStep[];
}

export interface StoredAgentSession {
  readonly id: string;
  // Las primeras palabras del primer mensaje, recortadas (asunción A2). Vacío hasta el primer turno.
  readonly title: string;
  readonly messages: readonly AgentMessage[]; // ya degradados (palanca 1)
  readonly turns: readonly StoredTurn[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoredAgentSessionSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MakeSessionInput {
  readonly id: string;
}

export interface AppendMessagesInput {
  readonly sessionId: string;
  readonly messages: readonly AgentMessage[];
}

// Cierra un turno: las nuevas mensajes (ya degradadas) más su observabilidad. Si la sesión no
// tenía título todavía, se fija aquí, una sola vez (asunción A2).
export interface AppendTurnInput {
  readonly sessionId: string;
  readonly messages: readonly AgentMessage[];
  readonly turn: StoredTurn;
  readonly title?: string | undefined;
}

export class SessionAlreadyExists extends Data.TaggedError("SessionAlreadyExists")<{
  readonly sessionId: string;
}> { }

export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{
  readonly sessionId: string;
}> { }

export class SessionRepositoryStorageError extends Data.TaggedError("SessionRepositoryStorageError")<{
  readonly reason: unknown;
}> { }

export class SessionRepositorySerializationError extends Data.TaggedError("SessionRepositorySerializationError")<{
  readonly reason: unknown;
}> { }

export type SessionRepositoryError =
  | SessionAlreadyExists
  | SessionNotFound
  | SessionRepositoryStorageError
  | SessionRepositorySerializationError;

export interface SessionRepository {
  readonly getSession: (
    id: string
  ) => Effect.Effect<StoredAgentSession, SessionRepositoryError | SessionNotFound>;
  readonly makeSession: (
    input: MakeSessionInput
  ) => Effect.Effect<StoredAgentSession, SessionRepositoryError>;
  readonly appendMessages: (
    input: AppendMessagesInput
  ) => Effect.Effect<void, SessionRepositoryError>;
  readonly appendTurn: (
    input: AppendTurnInput
  ) => Effect.Effect<void, SessionRepositoryError | SessionNotFound>;
  readonly listSessions: () => Effect.Effect<readonly StoredAgentSessionSummary[], SessionRepositoryError>;
  readonly deleteSession: (id: string) => Effect.Effect<void, SessionRepositoryError | SessionNotFound>;
}

export const SessionRepository = Context.Service<SessionRepository>(
  "@proxus/server/agents/SessionRepository"
);

import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { degradeHistory } from "../../domain/agents/harness/message-degrade.ts";
import {
  SessionAlreadyExists,
  SessionNotFound,
  SessionRepository,
  SessionRepositorySerializationError,
  SessionRepositoryStorageError,
  type AppendMessagesInput,
  type AppendTurnInput,
  type MakeSessionInput,
  type SessionRepository as SessionRepositoryType,
  type SessionRepositoryError,
  type StoredAgentSession,
  type StoredAgentSessionSummary
} from "../../domain/agents/harness/index.ts";

const UserMessageSchema = Schema.Struct({
  role: Schema.Literal("user"),
  content: Schema.String
});

const AssistantMessageSchema = Schema.Struct({
  role: Schema.Literal("assistant"),
  content: Schema.String
});

const ToolCallMessageSchema = Schema.Struct({
  role: Schema.Literal("tool-call"),
  name: Schema.String,
  input: Schema.Unknown
});

const ToolResultMessageSchema = Schema.Struct({
  role: Schema.Literal("tool-result"),
  name: Schema.String,
  result: Schema.Unknown,
  isFailure: Schema.Boolean
});

const AgentMessageSchema = Schema.Union([
  UserMessageSchema,
  AssistantMessageSchema,
  ToolCallMessageSchema,
  ToolResultMessageSchema
]);

const StoredStepUsageSchema = Schema.Struct({
  inputTokens: Schema.optional(Schema.Number),
  cachedInputTokens: Schema.optional(Schema.Number),
  outputTokens: Schema.optional(Schema.Number)
});

const StoredStepToolCallSchema = Schema.Struct({
  name: Schema.String,
  input: Schema.Unknown
});

const StoredStepErrorSchema = Schema.Struct({
  message: Schema.String,
  at: Schema.String
});

const StoredStepSchema = Schema.Struct({
  index: Schema.Number,
  usage: StoredStepUsageSchema,
  toolCalls: Schema.Array(StoredStepToolCallSchema),
  error: Schema.optional(StoredStepErrorSchema)
});

const StoredTurnSchema = Schema.Struct({
  startedAt: Schema.String,
  steps: Schema.Array(StoredStepSchema)
});

const StoredAgentSessionSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  messages: Schema.Array(AgentMessageSchema),
  turns: Schema.Array(StoredTurnSchema),
  createdAt: Schema.String,
  updatedAt: Schema.String
});

const StoredAgentSessionFromJson = Schema.fromJsonString(StoredAgentSessionSchema);

export const FileSessionRepository = {
  make: (directory: string): Effect.Effect<SessionRepositoryType, never, FileSystem.FileSystem | Path.Path> => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const pathForSession = (sessionId: string) =>
      path.join(directory, `${encodeURIComponent(sessionId)}.json`);

    const mapStorageError = (reason: unknown) => new SessionRepositoryStorageError({ reason });

    const readSessionFile = (sessionId: string): Effect.Effect<StoredAgentSession, SessionRepositoryError> => Effect.gen(function* () {
      const sessionPath = pathForSession(sessionId);
      const sessionExists = yield* fs.exists(sessionPath).pipe(
        Effect.mapError(mapStorageError)
      );

      if (!sessionExists) {
        return yield* new SessionNotFound({ sessionId });
      }

      const text = yield* fs.readFileString(sessionPath).pipe(
        Effect.mapError(mapStorageError)
      );

      return yield* Schema.decodeUnknownEffect(StoredAgentSessionFromJson)(text).pipe(
        Effect.mapError((reason) => new SessionRepositorySerializationError({ reason }))
      );
    });

    const writeSessionFile = (session: StoredAgentSession): Effect.Effect<void, SessionRepositoryError> => Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(StoredAgentSessionSchema)(session).pipe(
        Effect.mapError((reason) => new SessionRepositorySerializationError({ reason }))
      );
      const prettyJson = JSON.stringify(encoded, null, 2);

      if (prettyJson === undefined) {
        return yield* new SessionRepositorySerializationError({ reason: "Session did not encode to JSON" });
      }

      yield* fs.makeDirectory(directory, { recursive: true }).pipe(
        Effect.mapError(mapStorageError)
      );

      yield* fs.writeFileString(pathForSession(session.id), `${prettyJson}\n`).pipe(
        Effect.mapError(mapStorageError)
      );
    });

    const getSession = (id: string) => readSessionFile(id);

    const makeSession = (input: MakeSessionInput) => Effect.gen(function* () {
      const sessionPath = pathForSession(input.id);
      const sessionExists = yield* fs.exists(sessionPath).pipe(
        Effect.mapError(mapStorageError)
      );

      if (sessionExists) {
        return yield* new SessionAlreadyExists({ sessionId: input.id });
      }

      const now = new Date().toISOString();
      const session: StoredAgentSession = {
        id: input.id,
        title: "",
        messages: [],
        turns: [],
        createdAt: now,
        updatedAt: now
      };

      yield* writeSessionFile(session);

      return session;
    });

    // Nada crudo toca disco (palanca 1, "también en disco"): se degrada aquí, en el único punto de
    // escritura, para que ni este método ni `appendTurn` puedan olvidarlo.
    const appendMessages = (input: AppendMessagesInput) => Effect.gen(function* () {
      if (input.messages.length === 0) {
        return;
      }

      const session = yield* readSessionFile(input.sessionId);
      const updatedSession: StoredAgentSession = {
        ...session,
        messages: [...session.messages, ...degradeHistory(input.messages)],
        updatedAt: new Date().toISOString()
      };

      yield* writeSessionFile(updatedSession);
    });

    const appendTurn = (input: AppendTurnInput) => Effect.gen(function* () {
      const session = yield* readSessionFile(input.sessionId);
      const updatedSession: StoredAgentSession = {
        ...session,
        title: session.title.length === 0 && input.title !== undefined ? input.title : session.title,
        messages: [...session.messages, ...degradeHistory(input.messages)],
        turns: [...session.turns, input.turn],
        updatedAt: new Date().toISOString()
      };

      yield* writeSessionFile(updatedSession);
    });

    const listFiles = () => Effect.gen(function* () {
      const exists = yield* fs.exists(directory).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return [] as readonly string[];
      }
      return yield* fs.readDirectory(directory).pipe(Effect.mapError(mapStorageError));
    });

    // Igual que `file-artifact-repository.ts`: un fichero ilegible se anota en el log del servidor y
    // se salta, en vez de tumbar el listado entero de conversaciones (invariante 3).
    const listSessions = (): Effect.Effect<readonly StoredAgentSessionSummary[], SessionRepositoryError> => Effect.gen(function* () {
      const files = (yield* listFiles()).filter((file) => file.endsWith(".json"));
      const [, sessions] = yield* Effect.partition(files, (file) => {
        const sessionId = decodeURIComponent(file.replace(/\.json$/, ""));
        return readSessionFile(sessionId).pipe(
          Effect.tapError((error) => Effect.logWarning(`sesión ilegible ${file}: ${String("reason" in error ? error.reason : error._tag)}`)),
          Effect.mapError(() => file)
        );
      });

      return sessions.map((session): StoredAgentSessionSummary => ({
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));
    });

    const deleteSession = (id: string): Effect.Effect<void, SessionRepositoryError> => Effect.gen(function* () {
      const sessionPath = pathForSession(id);
      const exists = yield* fs.exists(sessionPath).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return yield* new SessionNotFound({ sessionId: id });
      }
      yield* fs.remove(sessionPath).pipe(Effect.mapError(mapStorageError));
    });

    return {
      getSession,
      makeSession,
      appendMessages,
      appendTurn,
      listSessions,
      deleteSession
    };
  }),
  layer: (directory: string) => Layer.effect(SessionRepository)(FileSessionRepository.make(directory))
};

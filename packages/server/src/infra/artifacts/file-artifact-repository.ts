import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { LIMITS } from "@proxus/shared";
import {
  Artifact,
  ArtifactAttempt,
  ArtifactNotFound,
  ArtifactRepository,
  ArtifactRepositorySerializationError,
  ArtifactRepositoryStorageError,
  ArtifactTypeMismatch,
  AttemptNotFound,
  CreateArtifactInput,
  ListArtifactsInput,
  SubmitAttemptInput,
  TooManyQuestions,
  makeArtifact,
  makeInProgressAttempt,
  type Artifact as ArtifactType,
  type ArtifactAttempt as ArtifactAttemptType,
  type ArtifactRepository as ArtifactRepositoryType,
  type ArtifactRepositoryError
} from "../../domain/artifacts/artifact.ts";
import { gradeInProgressAttempt } from "../../domain/artifacts/grading.ts";

const ArtifactFromJson = Schema.fromJsonString(Artifact);
const ArtifactAttemptFromJson = Schema.fromJsonString(ArtifactAttempt);

export const FileArtifactRepository = {
  make: (directory: string): Effect.Effect<ArtifactRepositoryType, never, FileSystem.FileSystem | Path.Path> => Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const artifactsDirectory = path.join(directory, "artifacts");
    const attemptsDirectory = path.join(directory, "attempts");

    const artifactPath = (id: string) => path.join(artifactsDirectory, `${encodeURIComponent(id)}.json`);
    const attemptPath = (id: string) => path.join(attemptsDirectory, `${encodeURIComponent(id)}.json`);

    const mapStorageError = (reason: unknown) => new ArtifactRepositoryStorageError({ reason });
    const mapSerializationError = (reason: unknown) => new ArtifactRepositorySerializationError({ reason });

    const ensureDirectories = () => fs.makeDirectory(directory, { recursive: true }).pipe(
      Effect.andThen(fs.makeDirectory(artifactsDirectory, { recursive: true })),
      Effect.andThen(fs.makeDirectory(attemptsDirectory, { recursive: true })),
      Effect.mapError(mapStorageError)
    );

    const readArtifactFile = (id: string): Effect.Effect<ArtifactType, ArtifactRepositoryError> => Effect.gen(function* () {
      const filePath = artifactPath(id);
      const exists = yield* fs.exists(filePath).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return yield* new ArtifactNotFound({ artifactId: id });
      }

      const text = yield* fs.readFileString(filePath).pipe(Effect.mapError(mapStorageError));
      return yield* Schema.decodeUnknownEffect(ArtifactFromJson)(text).pipe(
        Effect.mapError(mapSerializationError)
      );
    });

    const readAttemptFile = (id: string): Effect.Effect<ArtifactAttemptType, ArtifactRepositoryError> => Effect.gen(function* () {
      const filePath = attemptPath(id);
      const exists = yield* fs.exists(filePath).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return yield* new AttemptNotFound({ attemptId: id });
      }

      const text = yield* fs.readFileString(filePath).pipe(Effect.mapError(mapStorageError));
      return yield* Schema.decodeUnknownEffect(ArtifactAttemptFromJson)(text).pipe(
        Effect.mapError(mapSerializationError)
      );
    });

    const writeArtifactFile = (artifact: ArtifactType): Effect.Effect<void, ArtifactRepositoryError> => Effect.gen(function* () {
      // Techo duro del contrato (invariante 11, §5.7): se rechaza en voz alta al guardar, nunca se
      // recorta en silencio. `questionsPerQuiz`/`questionsPerTest` son los rangos que ve el alumno;
      // esto es el fusible de detrás.
      if (artifact.kind !== "note" && artifact.questions.length > LIMITS.maxQuestionsPerArtifact) {
        return yield* new TooManyQuestions({
          artifactId: artifact.id,
          ceiling: LIMITS.maxQuestionsPerArtifact,
          received: artifact.questions.length
        });
      }

      const encoded = yield* Schema.encodeUnknownEffect(Artifact)(artifact).pipe(
        Effect.mapError(mapSerializationError)
      );
      const prettyJson = JSON.stringify(encoded, null, 2);
      if (prettyJson === undefined) {
        return yield* new ArtifactRepositorySerializationError({ reason: "Artifact did not encode to JSON" });
      }

      yield* ensureDirectories();
      yield* fs.writeFileString(artifactPath(artifact.id), `${prettyJson}\n`).pipe(Effect.mapError(mapStorageError));
    });

    const writeAttemptFile = (attempt: ArtifactAttemptType): Effect.Effect<void, ArtifactRepositoryError> => Effect.gen(function* () {
      const encoded = yield* Schema.encodeUnknownEffect(ArtifactAttempt)(attempt).pipe(
        Effect.mapError(mapSerializationError)
      );
      const prettyJson = JSON.stringify(encoded, null, 2);
      if (prettyJson === undefined) {
        return yield* new ArtifactRepositorySerializationError({ reason: "Attempt did not encode to JSON" });
      }

      yield* ensureDirectories();
      yield* fs.writeFileString(attemptPath(attempt.id), `${prettyJson}\n`).pipe(Effect.mapError(mapStorageError));
    });

    const listFiles = (targetDirectory: string) => Effect.gen(function* () {
      const exists = yield* fs.exists(targetDirectory).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return [] as readonly string[];
      }
      return yield* fs.readDirectory(targetDirectory).pipe(Effect.mapError(mapStorageError));
    });

    // Recolecta por fichero: un JSON ilegible se anota con su motivo y se sigue, en vez de tumbar el
    // listado entero y dejar a la web sin barra lateral (F2-07, invariante 3).
    // El motivo va a la interfaz: se nombra qué fichero falla (F2-07, invariante 3) pero sin volcar el
    // `SchemaError` crudo, que es ruido para el usuario (fase 2, decisión 28). El detalle técnico, al
    // log del servidor.
    const describeReadError = (error: ArtifactRepositoryError): string => {
      switch (error._tag) {
        case "ArtifactNotFound":
          return "el fichero desapareció durante el listado";
        case "ArtifactRepositorySerializationError":
          return "no tiene el formato de un artefacto válido (puede ser de una versión anterior); bórralo o vuelve a generarlo";
        default:
          return "no se pudo leer del almacenamiento";
      }
    };

    const listArtifacts = (input: ListArtifactsInput = {}) => Effect.gen(function* () {
      const files = (yield* listFiles(artifactsDirectory)).filter((file) => file.endsWith(".json"));
      const [unreadable, artifacts] = yield* Effect.partition(files, (file) => {
        const artifactId = decodeURIComponent(file.replace(/\.json$/, ""));
        return readArtifactFile(artifactId).pipe(
          Effect.tapError((error) => Effect.logWarning(`artefacto ilegible ${file}: ${String("reason" in error ? error.reason : error._tag)}`)),
          Effect.mapError((error) => ({ fileName: file, reason: describeReadError(error) }))
        );
      });
      return {
        artifacts: artifacts.filter((artifact) => input.kind === undefined || artifact.kind === input.kind),
        unreadable
      };
    });

    // `createArtifact` ya no crea apuntes (fase 2, decisión 25): solo quiz y test. El apunte lo genera
    // `NoteGenerationService`, que comprueba el "un apunte por material" (decisión 19) antes de guardar.
    const createArtifact = (input: CreateArtifactInput) => Effect.gen(function* () {
      const artifact = makeArtifact(input);
      yield* writeArtifactFile(artifact);
      return artifact;
    });

    const deleteArtifact = (id: string): Effect.Effect<void, ArtifactRepositoryError> => Effect.gen(function* () {
      const filePath = artifactPath(id);
      const exists = yield* fs.exists(filePath).pipe(Effect.mapError(mapStorageError));
      if (!exists) {
        return yield* new ArtifactNotFound({ artifactId: id });
      }
      yield* fs.remove(filePath).pipe(Effect.mapError(mapStorageError));
    });

    const submitAttempt = (input: SubmitAttemptInput) => Effect.gen(function* () {
      const artifact = yield* readArtifactFile(input.artifactId);
      if (artifact.kind !== input.artifactKind) {
        return yield* new ArtifactTypeMismatch({
          artifactId: input.artifactId,
          expected: input.artifactKind,
          actual: artifact.kind
        });
      }

      const attempt = makeInProgressAttempt(input);
      yield* writeAttemptFile(attempt);
      return attempt;
    });

    // Igual que `listArtifacts`: un fichero de intento ilegible (por ejemplo de una versión anterior
    // del esquema) se salta y se registra con su motivo crudo en el log del servidor, en vez de
    // tumbar el listado entero (invariante 3). El motivo técnico no viaja al cliente.
    const listAttempts = (artifactId?: string) => Effect.gen(function* () {
      const files = (yield* listFiles(attemptsDirectory)).filter((file) => file.endsWith(".json"));
      const [, attempts] = yield* Effect.partition(files, (file) => {
        const attemptId = decodeURIComponent(file.replace(/\.json$/, ""));
        return readAttemptFile(attemptId).pipe(
          Effect.tapError((error) => Effect.logWarning(
            `intento ilegible ${file}: ${String("reason" in error ? error.reason : error._tag)}`
          )),
          Effect.mapError(() => file)
        );
      });
      return attempts.filter((attempt) => artifactId === undefined || attempt.artifactId === artifactId);
    });

    const gradeAttemptById = (attemptId: string) => Effect.gen(function* () {
      const attempt = yield* readAttemptFile(attemptId);
      if (attempt.status !== "in-progress") {
        // Ya cerrado (entregado o abandonado): se devuelve tal cual, no se vuelve a corregir.
        return attempt;
      }
      const artifact = yield* readArtifactFile(attempt.artifactId);
      if (artifact.kind === "note") {
        return yield* new ArtifactTypeMismatch({
          artifactId: artifact.id,
          expected: attempt.artifactKind,
          actual: artifact.kind
        });
      }
      const graded = gradeInProgressAttempt(artifact, attempt);
      yield* writeAttemptFile(graded);
      return graded;
    });

    return {
      createArtifact,
      deleteArtifact,
      saveArtifact: writeArtifactFile,
      getArtifact: readArtifactFile,
      listArtifacts,
      submitAttempt,
      saveAttempt: writeAttemptFile,
      getAttempt: readAttemptFile,
      listAttempts,
      gradeAttempt: gradeAttemptById
    };
  }),
  layer: (directory: string) => Layer.effect(ArtifactRepository)(FileArtifactRepository.make(directory))
};

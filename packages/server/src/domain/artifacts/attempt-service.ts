import { Context, Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  AttemptAlreadyClosed,
  AttemptLimitExceeded,
  AttemptNotFound,
  AttemptNotGraded,
  HintNotAvailable,
  LIMITS,
  QuestionNotFound,
  type ActiveAttemptResponse,
  type AssessmentListEntry,
  type AttemptMode,
  type SolvableAssessment,
  type SolvableQuestion,
  type TestAnswer
} from "@proxus/shared";
import { MaterialRepository } from "../materials/material.ts";
import {
  ArtifactRepository,
  type ArtifactAttempt,
  type ArtifactRepositoryError,
  type GradedAttempt,
  type InProgressAttempt,
  type QuizArtifact,
  type ShortAnswerCorrection,
  type TestArtifact
} from "./artifact.ts";
import { gradeInProgressAttempt } from "./grading.ts";
import { buildMaterialExcerpt } from "./note-source.ts";
import { OpenAnswerJudge, type JudgeQuestion } from "./open-answer-judge.ts";

// El ciclo de vida del intento, orquestado (§5.5, §6.1, §6.7). El intento nace `in-progress` en el
// servidor al empezarlo (decisión 8) y cierra a `graded` (entrega) o `abandoned` (cancelado o
// caducado). El único estado que mueve el perfil es `graded` (tramo 3D). La clave de respuesta no
// viaja al navegador mientras se resuelve (decisión 9): eso lo garantiza `toSolvable`.

type Assessment = QuizArtifact | TestArtifact;

export interface AttemptService {
  readonly solvable: (artifactId: string) => Effect.Effect<
    SolvableAssessment,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | ApiArtifactStorageError
  >;
  readonly start: (artifactId: string, mode: AttemptMode) => Effect.Effect<
    InProgressAttempt,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptLimitExceeded | ApiArtifactStorageError
  >;
  readonly revealHint: (artifactId: string, attemptId: string, questionId: string) => Effect.Effect<
    { readonly questionId: string; readonly hint: string },
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptNotFound | AttemptAlreadyClosed | HintNotAvailable | ApiArtifactStorageError
  >;
  readonly submit: (artifactId: string, attemptId: string, answers: readonly TestAnswer[]) => Effect.Effect<
    GradedAttempt,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptNotFound | AttemptAlreadyClosed | ApiArtifactStorageError,
    LanguageModel.LanguageModel
  >;
  readonly abandon: (attemptId: string, reason: "cancelled" | "expired") => Effect.Effect<
    ArtifactAttempt,
    AttemptNotFound | AttemptAlreadyClosed | ApiArtifactStorageError
  >;
  readonly history: (artifactId: string) => Effect.Effect<
    readonly ArtifactAttempt[],
    ApiArtifactNotFound | ApiArtifactTypeMismatch | ApiArtifactStorageError
  >;
  readonly get: (attemptId: string) => Effect.Effect<ArtifactAttempt, AttemptNotFound | ApiArtifactStorageError>;
  readonly activeExam: () => Effect.Effect<ActiveAttemptResponse, ApiArtifactStorageError>;
  readonly dispute: (attemptId: string, questionId: string) => Effect.Effect<
    GradedAttempt,
    AttemptNotFound | AttemptNotGraded | QuestionNotFound | ApiArtifactStorageError
  >;
}

export const AttemptService = Context.Service<AttemptService>("@proxus/server/artifacts/AttemptService");

const storageError = (context: string) => (error: ArtifactRepositoryError) =>
  new ApiArtifactStorageError({ message: `${context}: ${String("reason" in error ? error.reason : error._tag)}` });

// Proyección SIN clave de respuesta (decisión 9). Cada pregunta conserva su cita (toda pregunta
// enseña su cita); se le quitan `correctOptionId`/`correctAnswer`/`expectedAnswer`, la rúbrica, la
// explicación y el texto de la pista. `hasHint` deja a la interfaz pintar el botón de pista sin
// filtrar su contenido.
export const toSolvable = (artifact: Assessment): SolvableAssessment => ({
  id: artifact.id,
  kind: artifact.kind,
  title: artifact.title,
  examTimeLimitSeconds: artifact.examTimeLimitSeconds,
  questions: artifact.questions.map((question): SolvableQuestion => {
    switch (question.type) {
      case "multiple-choice":
      case "multiple-response":
        return {
          type: question.type,
          id: question.id,
          prompt: question.prompt,
          options: question.options,
          source: question.source,
          hasHint: question.hint !== null
        };
      case "true-false":
      case "short-answer":
        return {
          type: question.type,
          id: question.id,
          prompt: question.prompt,
          source: question.source,
          hasHint: question.hint !== null
        };
    }
  })
});

// El instante que ordena un intento en el historial: cuándo se cerró, o cuándo empezó si sigue vivo.
const attemptInstant = (attempt: ArtifactAttempt): string =>
  attempt.status === "graded" ? attempt.submittedAt
    : attempt.status === "abandoned" ? attempt.abandonedAt
    : attempt.startedAt;

// La fila de la pestaña Pruebas: la prueba y su último intento. Pura.
export const buildAssessmentListEntry = (
  artifact: Assessment,
  attempts: readonly ArtifactAttempt[]
): AssessmentListEntry => {
  const own = [...attempts.filter((attempt) => attempt.artifactId === artifact.id)]
    .sort((a, b) => attemptInstant(b).localeCompare(attemptInstant(a)));
  const last = own[0];
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    scope: artifact.scope,
    origin: artifact.origin,
    createdAt: artifact.createdAt,
    questionCount: artifact.questions.length,
    examTimeLimitSeconds: artifact.examTimeLimitSeconds,
    lastAttempt: last === undefined ? null : {
      id: last.id,
      status: last.status,
      mode: last.mode,
      displayedScore: last.status === "graded" ? last.displayedScore : null,
      submittedAt: last.status === "graded" ? last.submittedAt : null
    }
  };
};

export const make = (
  repository: ArtifactRepository,
  materials: MaterialRepository,
  judge: OpenAnswerJudge
): AttemptService => {
  const getAssessment = (artifactId: string) =>
    repository.getArtifact(artifactId).pipe(
      Effect.mapError((error): ApiArtifactNotFound | ApiArtifactStorageError =>
        error._tag === "ArtifactNotFound"
          ? new ApiArtifactNotFound({ artifactId, message: `No hay ninguna prueba con id ${artifactId}.` })
          : storageError(`No se pudo leer la prueba ${artifactId}`)(error)),
      Effect.flatMap((artifact) =>
        artifact.kind === "note"
          ? Effect.fail(new ApiArtifactTypeMismatch({
              artifactId,
              expected: "quiz",
              actual: artifact.kind,
              message: `El artefacto ${artifactId} es un apunte, no una prueba.`
            }))
          : Effect.succeed(artifact))
    );

  const getInProgress = (attemptId: string) =>
    repository.getAttempt(attemptId).pipe(
      Effect.mapError((error): AttemptNotFound | ApiArtifactStorageError =>
        error._tag === "AttemptNotFound"
          ? new AttemptNotFound({ attemptId, message: `No hay ningún intento con id ${attemptId}.` })
          : storageError(`No se pudo leer el intento ${attemptId}`)(error)),
      Effect.flatMap((attempt) =>
        attempt.status === "in-progress"
          ? Effect.succeed(attempt)
          : Effect.fail(new AttemptAlreadyClosed({
              attemptId,
              status: attempt.status,
              message: attempt.status === "graded"
                ? "Este intento ya se entregó y corrigió."
                : "Este intento ya se canceló."
            })))
    );

  const save = (attempt: ArtifactAttempt, context: string) =>
    repository.saveAttempt(attempt).pipe(Effect.mapError(storageError(context)));

  const solvable = (artifactId: string) => getAssessment(artifactId).pipe(Effect.map(toSolvable));

  const start = (artifactId: string, mode: AttemptMode) => Effect.gen(function* () {
    const artifact = yield* getAssessment(artifactId);
    const attempts = yield* repository.listAttempts(artifactId).pipe(
      Effect.mapError(storageError(`No se pudo leer los intentos de ${artifactId}`))
    );
    // Un intento cancelado o caducado también cuenta contra el techo (decisión 22): abandonar tiene
    // el mismo precio que intentar.
    const sameMode = attempts.filter((attempt) => attempt.mode === mode).length;
    const ceiling = mode === "exam" ? LIMITS.maxExamAttemptsPerAssessment : LIMITS.maxPracticeAttemptsPerAssessment;
    if (sameMode >= ceiling) {
      return yield* new AttemptLimitExceeded({
        mode,
        ceiling,
        current: sameMode,
        message: `Ya has hecho ${sameMode} intentos de esta prueba en modo ${mode === "exam" ? "examen" : "práctica"} (el máximo es ${ceiling}).`
      });
    }

    const now = new Date().toISOString();
    const attempt: InProgressAttempt = {
      id: crypto.randomUUID(),
      artifactId,
      artifactKind: artifact.kind,
      mode,
      status: "in-progress",
      startedAt: now,
      timeLimitSeconds: mode === "exam" ? artifact.examTimeLimitSeconds : null,
      hintsRevealed: [],
      answers: [],
      connectedSeconds: 0,
      lastHeartbeatAt: null,
      interruptions: []
    };
    yield* save(attempt, `No se pudo crear el intento de ${artifactId}`);
    return attempt;
  });

  const revealHint = (artifactId: string, attemptId: string, questionId: string) => Effect.gen(function* () {
    const attempt = yield* getInProgress(attemptId);
    if (attempt.mode === "exam") {
      // La barrera está en el código, no en la interfaz (decisión 10).
      return yield* new HintNotAvailable({
        questionId,
        reason: "exam-mode",
        message: "En modo examen no hay pistas."
      });
    }
    const artifact = yield* getAssessment(artifactId);
    const question = artifact.questions.find((candidate) => candidate.id === questionId);
    if (question === undefined || question.hint === null) {
      return yield* new HintNotAvailable({
        questionId,
        reason: "no-hint",
        message: "Esta pregunta no tiene pista."
      });
    }

    // Abrir una pista es una señal propia (invariante 5, decisión 11): se registra aunque se abra
    // dos veces, y nunca convierte un acierto en fallo.
    if (!attempt.hintsRevealed.includes(questionId)) {
      yield* save(
        { ...attempt, hintsRevealed: [...attempt.hintsRevealed, questionId] },
        `No se pudo registrar la pista del intento ${attemptId}`
      );
    }
    return { questionId, hint: question.hint };
  });

  const excerptFor = (source: { readonly materialId: string; readonly pages: readonly number[] }) =>
    materials.getIndex(source.materialId).pipe(
      Effect.map((index) => buildMaterialExcerpt(index, source.pages).excerpt),
      Effect.catch(() => Effect.succeed(null))
    );

  const submit = (artifactId: string, attemptId: string, answers: readonly TestAnswer[]) => Effect.gen(function* () {
    const attempt = yield* getInProgress(attemptId);
    const artifact = yield* getAssessment(artifactId);

    // El juez corrige el desarrollo corto; la aritmética la hace el código (ADR-019). Solo se le
    // manda lo respondido: una en blanco es una corrección `blank`, la hace `grading.ts`.
    const openQuestions = artifact.questions.filter((question) => question.type === "short-answer");
    const judgeInputs: JudgeQuestion[] = [];
    for (const question of openQuestions) {
      if (question.type !== "short-answer") {
        continue;
      }
      const answer = answers.find((candidate) => candidate.questionId === question.id);
      if (answer === undefined || answer.questionType !== "short-answer" || answer.answer.trim().length === 0) {
        continue;
      }
      const excerpt = yield* excerptFor(question.source);
      judgeInputs.push({
        questionId: question.id,
        prompt: question.prompt,
        expectedAnswer: question.expectedAnswer,
        rubric: question.rubric,
        maxScore: question.maxScore,
        answer: answer.answer,
        materialExcerpt: excerpt
      });
    }

    const openCorrections: readonly ShortAnswerCorrection[] = judgeInputs.length === 0
      ? []
      : yield* judge.grade(judgeInputs);

    const graded = gradeInProgressAttempt(artifact, { ...attempt, answers }, openCorrections);
    yield* save(graded, `No se pudo guardar el intento entregado ${attemptId}`);
    return graded;
  });

  const abandon = (attemptId: string, reason: "cancelled" | "expired") => Effect.gen(function* () {
    const attempt = yield* getInProgress(attemptId);
    const abandoned: ArtifactAttempt = {
      ...attempt,
      status: "abandoned",
      reason,
      abandonedAt: new Date().toISOString()
    };
    yield* save(abandoned, `No se pudo cancelar el intento ${attemptId}`);
    return abandoned;
  });

  const history = (artifactId: string) => Effect.gen(function* () {
    yield* getAssessment(artifactId);
    return yield* repository.listAttempts(artifactId).pipe(
      Effect.mapError(storageError(`No se pudo leer el historial de ${artifactId}`))
    );
  });

  const get = (attemptId: string) =>
    repository.getAttempt(attemptId).pipe(
      Effect.mapError((error): AttemptNotFound | ApiArtifactStorageError =>
        error._tag === "AttemptNotFound"
          ? new AttemptNotFound({ attemptId, message: `No hay ningún intento con id ${attemptId}.` })
          : storageError(`No se pudo leer el intento ${attemptId}`)(error))
    );

  const activeExam = () =>
    repository.listAttempts().pipe(
      Effect.mapError(storageError("No se pudo comprobar si hay un examen en curso")),
      Effect.map((attempts): ActiveAttemptResponse => {
        const active = attempts.find(
          (attempt): attempt is InProgressAttempt => attempt.status === "in-progress" && attempt.mode === "exam"
        );
        if (active === undefined || active.timeLimitSeconds === null) {
          return { attemptId: null, artifactId: null, artifactKind: null, remainingSeconds: null };
        }
        return {
          attemptId: active.id,
          artifactId: active.artifactId,
          artifactKind: active.artifactKind,
          remainingSeconds: Math.max(0, active.timeLimitSeconds - active.connectedSeconds)
        };
      })
    );

  const dispute = (attemptId: string, questionId: string) => Effect.gen(function* () {
    const attempt = yield* get(attemptId);
    if (attempt.status !== "graded") {
      return yield* new AttemptNotGraded({
        attemptId,
        message: "Solo se puede discrepar de una pregunta de un intento ya corregido."
      });
    }
    const correction = attempt.corrections.find(
      (candidate) => candidate.questionId === questionId && candidate.questionType === "short-answer"
    );
    if (correction === undefined || correction.questionType !== "short-answer") {
      return yield* new QuestionNotFound({
        questionId,
        message: `El intento ${attemptId} no tiene una respuesta de desarrollo corto con id ${questionId}.`
      });
    }

    // La pregunta pasa a `disputed`: deja de mover el perfil, en ninguna dirección (§6.7, defensa 1).
    // La nota mostrada del intento NO cambia (decisión 43): no se puede usar para inflarse.
    const disputed: GradedAttempt = {
      ...attempt,
      corrections: attempt.corrections.map((candidate) =>
        candidate.questionId === questionId && candidate.questionType === "short-answer"
          ? { ...candidate, status: "disputed" as const, score: null }
          : candidate)
    };
    yield* save(disputed, `No se pudo registrar la discrepancia del intento ${attemptId}`);
    return disputed;
  });

  return { solvable, start, revealHint, submit, abandon, history, get, activeExam, dispute };
};

export const AttemptServiceLive = Layer.effect(AttemptService)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const materials = yield* MaterialRepository;
    const judge = yield* OpenAnswerJudge;
    return make(repository, materials, judge);
  })
);

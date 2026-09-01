import { Context, Effect, Layer } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import {
  ArtifactNotFound as ApiArtifactNotFound,
  ArtifactStorageError as ApiArtifactStorageError,
  ArtifactTypeMismatch as ApiArtifactTypeMismatch,
  AttemptAlreadyClosed,
  AttemptInProgress,
  AttemptLimitExceeded,
  AttemptNotFound,
  AttemptNotGraded,
  HintNotAvailable,
  LIMITS,
  LimitExceeded,
  QuestionNotFound,
  TimeLimitExceeded,
  type ActiveAttemptResponse,
  type AssessmentListEntry,
  type AttemptMode,
  type HeartbeatResponse,
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
import { requestedQuestionCount } from "./assessment-shortfall.ts";
import { applyHeartbeat, connectedSecondsNow, remainingSeconds } from "./exam-clock.ts";
import { findActiveExam } from "./exam-lockdown.ts";
import { gradeInProgressAttempt } from "./grading.ts";
import { buildMaterialExcerpt } from "./note-source.ts";
import { OpenAnswerJudge, type JudgeQuestion } from "./open-answer-judge.ts";
import { StudyProfileService } from "../profile/study-profile.ts";

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
  readonly start: (artifactId: string) => Effect.Effect<
    InProgressAttempt,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptLimitExceeded | AttemptInProgress | ApiArtifactStorageError
  >;
  readonly revealHint: (artifactId: string, attemptId: string, questionId: string) => Effect.Effect<
    { readonly questionId: string; readonly hint: string },
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptNotFound | AttemptAlreadyClosed | HintNotAvailable | ApiArtifactStorageError
  >;
  readonly submit: (artifactId: string, attemptId: string, answers: readonly TestAnswer[]) => Effect.Effect<
    GradedAttempt,
    ApiArtifactNotFound | ApiArtifactTypeMismatch | AttemptNotFound | AttemptAlreadyClosed | TimeLimitExceeded | LimitExceeded | ApiArtifactStorageError,
    LanguageModel.LanguageModel
  >;
  readonly abandon: (attemptId: string, reason: "cancelled" | "expired") => Effect.Effect<
    ArtifactAttempt,
    AttemptNotFound | AttemptAlreadyClosed | ApiArtifactStorageError
  >;
  // El latido del examen (decisión 19c): acumula tiempo conectado, cierra el hueco de interrupción si
  // venía de uno, y devuelve el tiempo que queda. Si el tiempo conectado se agotó, cierra el intento
  // como `abandoned`/`expired` y lo dice.
  readonly heartbeat: (attemptId: string) => Effect.Effect<
    HeartbeatResponse,
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

// El mensaje al usuario dice qué falló, no cómo: el motivo crudo (ruta, SchemaError, `_tag`) es fuga
// de detalle interno y no le sirve de nada. El detalle técnico va al log del servidor; los listados
// registran cada fichero ilegible (`file-artifact-repository.ts`).
const storageError = (context: string) => (_error: ArtifactRepositoryError) =>
  new ApiArtifactStorageError({ message: `${context}. Vuelve a intentarlo en un momento.` });

// Proyección SIN clave de respuesta (decisión 9). Cada pregunta conserva su cita (toda pregunta
// enseña su cita); se le quitan `correctOptionId`/`correctAnswer`/`expectedAnswer`, la rúbrica, la
// explicación y el texto de la pista. `hasHint` deja a la interfaz pintar el botón de pista sin
// filtrar su contenido.
export const toSolvable = (artifact: Assessment): SolvableAssessment => ({
  id: artifact.id,
  kind: artifact.kind,
  title: artifact.title,
  examTimeLimitSeconds: artifact.examTimeLimitSeconds,
  requestedQuestionCount: requestedQuestionCount(artifact),
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
    // El Control es siempre de práctica; el Examen lleva su modo en el artefacto.
    mode: artifact.kind === "test" ? artifact.mode : "practice",
    scope: artifact.scope,
    origin: artifact.origin,
    createdAt: artifact.createdAt,
    questionCount: artifact.questions.length,
    requestedQuestionCount: requestedQuestionCount(artifact),
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
  judge: OpenAnswerJudge,
  profile: StudyProfileService
): AttemptService => {
  // El único estado que mueve el perfil es `graded` (§5.5). El perfil es una proyección de los
  // intentos corregidos: se recalcula al entregar y al discrepar. Un fallo al recalcularlo NO tumba
  // la entrega (el intento ya está corregido y guardado); se registra y el siguiente `sync` o `read`
  // lo rehará, porque parte de cero.
  const syncProfile = (materialId: string) =>
    profile.sync(materialId).pipe(
      Effect.catchTag("StudyProfileError", (error) =>
        Effect.logWarning(`no se pudo recalcular el perfil de ${materialId}: ${error.reason}`)),
      Effect.asVoid
    );

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

  const start = (artifactId: string) => Effect.gen(function* () {
    const artifact = yield* getAssessment(artifactId);
    // El modo lo fija el artefacto, no quien empieza (ADR que anula la decisión 6): un Control es
    // siempre de práctica; un Examen, lo que se eligió al generarlo.
    const mode: AttemptMode = artifact.kind === "test" ? artifact.mode : "practice";
    const allAttempts = yield* repository.listAttempts().pipe(
      Effect.mapError(storageError(`No se pudo leer los intentos de ${artifactId}`))
    );

    // Solo se puede tener un intento abierto a la vez, sea de práctica o de examen y sea de la prueba
    // que sea. Empezar de nuevo LA MISMA prueba en EL MISMO modo retoma el intento a medias (el
    // intento se guarda aunque lo dejes a medias); cualquier otro intento abierto se rechaza nombrando
    // cuál es, para que la interfaz ofrezca retomarlo o cancelarlo.
    const openHere = allAttempts.find(
      (attempt): attempt is InProgressAttempt =>
        attempt.status === "in-progress" && attempt.artifactId === artifactId && attempt.mode === mode
    );
    if (openHere !== undefined) {
      return openHere;
    }
    const openElsewhere = allAttempts.find(
      (attempt): attempt is InProgressAttempt => attempt.status === "in-progress"
    );
    if (openElsewhere !== undefined) {
      return yield* new AttemptInProgress({
        attemptId: openElsewhere.id,
        artifactId: openElsewhere.artifactId,
        artifactKind: openElsewhere.artifactKind,
        mode: openElsewhere.mode,
        message: `Ya tienes un intento a medias en modo ${openElsewhere.mode === "exam" ? "examen" : "práctica"}. Entrégalo o cancélalo antes de empezar otro.`
      });
    }

    const attempts = allAttempts.filter((attempt) => attempt.artifactId === artifactId);
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
    const inProgress = yield* getInProgress(attemptId);
    const artifact = yield* getAssessment(artifactId);

    // El reloj lo cierra el servidor (decisión 9). En modo examen se acumula un último tramo de
    // tiempo conectado y, si la entrega llega pasado el límite más la holgura de red, se rechaza:
    // la entrega automática del cliente cabe dentro de la holgura; un `curl` tardío, no.
    const now = new Date().toISOString();
    const finalStep = inProgress.mode === "exam" ? applyHeartbeat(inProgress, now) : null;
    const attempt = finalStep === null ? inProgress : { ...inProgress, ...finalStep };
    if (
      attempt.mode === "exam" &&
      attempt.timeLimitSeconds !== null &&
      connectedSecondsNow(attempt, now) > attempt.timeLimitSeconds + LIMITS.examSubmitGraceSeconds
    ) {
      return yield* new TimeLimitExceeded({
        attemptId,
        message: "El tiempo del examen se agotó. Este intento ya no se puede entregar."
      });
    }

    // El techo de caracteres del desarrollo corto lo impone el servidor, no el `maxLength` del
    // `<textarea>` (invariante 11): un cliente que no sea la web podría saltárselo.
    for (const answer of answers) {
      if (answer.questionType === "short-answer" && answer.answer.length > LIMITS.maxOpenAnswerCharacters) {
        return yield* new LimitExceeded({
          limit: "maxOpenAnswerCharacters",
          ceiling: LIMITS.maxOpenAnswerCharacters,
          received: answer.answer.length,
          message: `Una respuesta supera el máximo de ${LIMITS.maxOpenAnswerCharacters} caracteres (tiene ${answer.answer.length}).`
        });
      }
    }

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
    yield* syncProfile(artifact.scope.materialId);
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

  const noActiveExam: ActiveAttemptResponse = {
    attemptId: null,
    artifactId: null,
    artifactKind: null,
    title: null,
    remainingSeconds: null
  };

  const activeExam = () => Effect.gen(function* () {
    const attempts = yield* repository.listAttempts().pipe(
      Effect.mapError(storageError("No se pudo comprobar si hay un examen en curso"))
    );
    const now = new Date().toISOString();
    const found = findActiveExam(attempts, now);
    if (found === null) {
      return noActiveExam;
    }
    // La caducidad se resuelve al mirarla (§5.5): si el tiempo conectado se agotó, se cierra aquí
    // como `abandoned`/`expired` y la puerta se abre sola.
    if (found.expired !== null) {
      yield* save(found.expired, `No se pudo cerrar el examen caducado ${found.attempt.id}`);
      return noActiveExam;
    }
    // El título es para nombrar el examen en el diálogo de "tienes un examen a medias"; si la prueba
    // no se puede leer, el diálogo sigue saliendo sin nombre, que es preferible a dejar la puerta
    // cerrada por un fallo de lectura del título.
    const title = yield* repository.getArtifact(found.attempt.artifactId).pipe(
      Effect.map((artifact): string | null => artifact.title),
      Effect.catch(() => Effect.succeed(null))
    );
    return {
      attemptId: found.attempt.id,
      artifactId: found.attempt.artifactId,
      artifactKind: found.attempt.artifactKind,
      title,
      remainingSeconds: remainingSeconds(found.attempt, now)
    };
  });

  const heartbeat = (attemptId: string) => Effect.gen(function* () {
    const attempt = yield* getInProgress(attemptId);
    if (attempt.mode !== "exam" || attempt.timeLimitSeconds === null) {
      // Una práctica no tiene reloj: el latido no hace nada (decisión 4).
      return { attemptStatus: "in-progress", remainingSeconds: 0 } satisfies HeartbeatResponse;
    }
    const now = new Date().toISOString();
    const step = applyHeartbeat(attempt, now);
    const ticked: InProgressAttempt = { ...attempt, ...step };

    if (step.connectedSeconds >= attempt.timeLimitSeconds) {
      const expired: ArtifactAttempt = {
        ...ticked,
        status: "abandoned",
        reason: "expired",
        abandonedAt: now
      };
      yield* save(expired, `No se pudo cerrar el examen caducado ${attemptId}`);
      return { attemptStatus: "abandoned", remainingSeconds: 0 } satisfies HeartbeatResponse;
    }

    yield* save(ticked, `No se pudo registrar el latido del intento ${attemptId}`);
    return {
      attemptStatus: "in-progress",
      remainingSeconds: Math.max(0, attempt.timeLimitSeconds - step.connectedSeconds)
    } satisfies HeartbeatResponse;
  });

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
    // La pregunta discrepada deja de mover el perfil: se recalcula desde los intentos ya corregidos.
    const assessment = yield* getAssessment(attempt.artifactId).pipe(
      Effect.catch(() => Effect.succeed(null))
    );
    if (assessment !== null) {
      yield* syncProfile(assessment.scope.materialId);
    }
    return disputed;
  });

  return { solvable, start, revealHint, submit, abandon, heartbeat, history, get, activeExam, dispute };
};

export const AttemptServiceLive = Layer.effect(AttemptService)(
  Effect.gen(function* () {
    const repository = yield* ArtifactRepository;
    const materials = yield* MaterialRepository;
    const judge = yield* OpenAnswerJudge;
    const profile = yield* StudyProfileService;
    return make(repository, materials, judge, profile);
  })
);

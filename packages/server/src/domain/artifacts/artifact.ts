import { Context, Data, Effect, Schema } from "effect";

// Los esquemas del apunte por bloques. Mirror palabra por palabra de
// `packages/shared/src/schemas/note.ts`: el servidor decodifica el fichero de disco con esta copia y
// lo sirve con la de `shared` (architecture.md:288). Si se cambia una sin la otra, el typecheck no
// avisa. Hay un test que decodifica un apunte con el esquema de `shared` para cerrar esa grieta.
export const MaterialBlockSource = Schema.Struct({
  type: Schema.Literal("material"),
  materialId: Schema.String,
  pages: Schema.Array(Schema.Number),
  excerpt: Schema.NullOr(Schema.String),
  excerptTruncated: Schema.Boolean,
  transcribed: Schema.Boolean,
  unanchoredReason: Schema.NullOr(Schema.String)
});
export type MaterialBlockSource = typeof MaterialBlockSource.Type;

export const UrlBlockSource = Schema.Struct({
  type: Schema.Literal("url"),
  url: Schema.String,
  fetchedAt: Schema.String,
  title: Schema.String,
  excerpt: Schema.String,
  excerptTruncated: Schema.Boolean
});
export type UrlBlockSource = typeof UrlBlockSource.Type;

export const BlockSource = Schema.Union([MaterialBlockSource, UrlBlockSource]);
export type BlockSource = typeof BlockSource.Type;

export const BlockAuthor = Schema.Union([Schema.Literal("tutor"), Schema.Literal("student")]);
export type BlockAuthor = typeof BlockAuthor.Type;

export const NoteBlock = Schema.Struct({
  id: Schema.String,
  markdown: Schema.String,
  author: BlockAuthor,
  emphasis: Schema.Boolean,
  source: Schema.NullOr(BlockSource)
});
export type NoteBlock = typeof NoteBlock.Type;

export const NoteProposalOperation = Schema.Union([
  Schema.Struct({ type: Schema.Literal("insert"), afterBlockId: Schema.NullOr(Schema.String), block: NoteBlock }),
  Schema.Struct({ type: Schema.Literal("replace"), blockId: Schema.String, markdown: Schema.String, baseMarkdown: Schema.String }),
  Schema.Struct({ type: Schema.Literal("remove"), blockId: Schema.String, baseMarkdown: Schema.String })
]);
export type NoteProposalOperation = typeof NoteProposalOperation.Type;

export const NoteProposal = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.String,
  rationale: Schema.String,
  operation: NoteProposalOperation
});
export type NoteProposal = typeof NoteProposal.Type;

export const NoteBlockInputSource = Schema.NullOr(Schema.Union([
  Schema.Struct({ type: Schema.Literal("material"), materialId: Schema.String, pages: Schema.Array(Schema.Number) }),
  UrlBlockSource
]));
export type NoteBlockInputSource = typeof NoteBlockInputSource.Type;

export const NoteBlockInput = Schema.Struct({
  id: Schema.optional(Schema.String),
  markdown: Schema.String,
  author: BlockAuthor,
  emphasis: Schema.Boolean,
  source: NoteBlockInputSource
});
export type NoteBlockInput = typeof NoteBlockInput.Type;

export const SaveNoteInput = Schema.Struct({
  title: Schema.String,
  blocks: Schema.Array(NoteBlockInput)
});
export type SaveNoteInput = typeof SaveNoteInput.Type;

// --- Pruebas (fase 3) --------------------------------------------------------
// Mirror palabra por palabra de `packages/shared/src/schemas/artifact.ts`. Ver la nota de arriba.

export const QuestionOption = Schema.Struct({
  id: Schema.String,
  text: Schema.String
});
export type QuestionOption = typeof QuestionOption.Type;

// La cita de una pregunta. La COPIA el código del índice del material (decisión 5, F2-09), nunca la
// propone el modelo. `transcribed` marca que alguna página citada viene de una transcripción del
// modelo (invariante 8); `unanchoredReason` no nulo significa que la cita no se pudo comprobar y la
// interfaz lo enseña (invariante 2: ni se descarta ni se publica en silencio).
export const QuestionSource = Schema.Struct({
  materialId: Schema.String,
  topicId: Schema.String,
  pages: Schema.Array(Schema.Number),
  transcribed: Schema.Boolean,
  unanchoredReason: Schema.NullOr(Schema.String)
});
export type QuestionSource = typeof QuestionSource.Type;

// Un criterio de la rúbrica de un desarrollo corto. El `id` (`c1`, `c2`, …) lo pone el código, no el
// modelo (decisión 20b): así no hay ningún nombre que se pueda desincronizar entre la pregunta y la
// corrección.
export const RubricCriterion = Schema.Struct({
  id: Schema.String,
  text: Schema.String
});
export type RubricCriterion = typeof RubricCriterion.Type;

export const MultipleChoiceQuestion = Schema.Struct({
  type: Schema.Literal("multiple-choice"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  correctOptionId: Schema.String,
  explanation: Schema.String,
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type MultipleChoiceQuestion = typeof MultipleChoiceQuestion.Type;

// Varias opciones, dos o más correctas (decisión 13). Solo entra en un Examen, no en un Control
// (§6.2). `correctOptionIds` casa contra los ids de `options`, que pone el código por posición.
export const MultipleResponseQuestion = Schema.Struct({
  type: Schema.Literal("multiple-response"),
  id: Schema.String,
  prompt: Schema.String,
  options: Schema.Array(QuestionOption),
  correctOptionIds: Schema.Array(Schema.String),
  explanation: Schema.String,
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type MultipleResponseQuestion = typeof MultipleResponseQuestion.Type;

export const TrueFalseQuestion = Schema.Struct({
  type: Schema.Literal("true-false"),
  id: Schema.String,
  prompt: Schema.String,
  correctAnswer: Schema.Boolean,
  explanation: Schema.String,
  hint: Schema.NullOr(Schema.String),
  source: QuestionSource
});
export type TrueFalseQuestion = typeof TrueFalseQuestion.Type;

export const ShortAnswerQuestion = Schema.Struct({
  type: Schema.Literal("short-answer"),
  id: Schema.String,
  prompt: Schema.String,
  expectedAnswer: Schema.String,
  maxScore: Schema.Number,
  hint: Schema.NullOr(Schema.String),
  rubric: Schema.Array(RubricCriterion),
  source: QuestionSource
});
export type ShortAnswerQuestion = typeof ShortAnswerQuestion.Type;

export const QuizQuestion = Schema.Union([
  MultipleChoiceQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion
]);
export type QuizQuestion = typeof QuizQuestion.Type;

export const TestQuestion = Schema.Union([
  MultipleChoiceQuestion,
  MultipleResponseQuestion,
  TrueFalseQuestion,
  ShortAnswerQuestion
]);
export type TestQuestion = typeof TestQuestion.Type;

export const AssessmentScope = Schema.Struct({
  materialId: Schema.String,
  topicId: Schema.NullOr(Schema.String),
  topicLabel: Schema.String
});
export type AssessmentScope = typeof AssessmentScope.Type;

export const AssessmentOrigin = Schema.Union([
  Schema.Literal("material"),
  Schema.Literal("review")
]);
export type AssessmentOrigin = typeof AssessmentOrigin.Type;

export const NoteArtifact = Schema.Struct({
  kind: Schema.Literal("note"),
  id: Schema.String,
  title: Schema.String,
  materialId: Schema.String,
  blocks: Schema.Array(NoteBlock),
  proposals: Schema.Array(NoteProposal)
});
export type NoteArtifact = typeof NoteArtifact.Type;

export const QuizArtifact = Schema.Struct({
  kind: Schema.Literal("quiz"),
  id: Schema.String,
  title: Schema.String,
  questions: Schema.Array(QuizQuestion),
  scope: AssessmentScope,
  origin: AssessmentOrigin,
  createdAt: Schema.String,
  examTimeLimitSeconds: Schema.Number
});
export type QuizArtifact = typeof QuizArtifact.Type;

export const TestArtifact = Schema.Struct({
  kind: Schema.Literal("test"),
  id: Schema.String,
  title: Schema.String,
  questions: Schema.Array(TestQuestion),
  scope: AssessmentScope,
  origin: AssessmentOrigin,
  createdAt: Schema.String,
  examTimeLimitSeconds: Schema.Number
});
export type TestArtifact = typeof TestArtifact.Type;

export const Artifact = Schema.Union([
  NoteArtifact,
  QuizArtifact,
  TestArtifact
]);
export type Artifact = typeof Artifact.Type;
export type ArtifactKind = Artifact["kind"];

// Fase 2, decisión 25: el agente ya no crea apuntes. Fase 3, decisión 4: el agente tampoco crea
// Controles ni Exámenes en esta fase (vuelven en la fase 4, anclados). `CreateArtifactInput` sigue
// aquí solo para el comando `artifacts create`, que se retira en el tramo 3D; `makeArtifact` rellena
// los campos de alcance con marcadores hasta entonces.
export const CreateQuizArtifactInput = Schema.Struct({
  kind: Schema.Literal("quiz"),
  title: Schema.String,
  questions: Schema.Array(QuizQuestion)
});
export type CreateQuizArtifactInput = typeof CreateQuizArtifactInput.Type;

export const CreateTestArtifactInput = Schema.Struct({
  kind: Schema.Literal("test"),
  title: Schema.String,
  questions: Schema.Array(TestQuestion)
});
export type CreateTestArtifactInput = typeof CreateTestArtifactInput.Type;

export const CreateArtifactInput = Schema.Union([
  CreateQuizArtifactInput,
  CreateTestArtifactInput
]);
export type CreateArtifactInput = typeof CreateArtifactInput.Type;

export const MultipleChoiceAnswer = Schema.Struct({
  questionType: Schema.Literal("multiple-choice"),
  questionId: Schema.String,
  selectedOptionId: Schema.String
});
export type MultipleChoiceAnswer = typeof MultipleChoiceAnswer.Type;

export const MultipleResponseAnswer = Schema.Struct({
  questionType: Schema.Literal("multiple-response"),
  questionId: Schema.String,
  selectedOptionIds: Schema.Array(Schema.String)
});
export type MultipleResponseAnswer = typeof MultipleResponseAnswer.Type;

export const TrueFalseAnswer = Schema.Struct({
  questionType: Schema.Literal("true-false"),
  questionId: Schema.String,
  answer: Schema.Boolean
});
export type TrueFalseAnswer = typeof TrueFalseAnswer.Type;

export const ShortAnswerAnswer = Schema.Struct({
  questionType: Schema.Literal("short-answer"),
  questionId: Schema.String,
  answer: Schema.String
});
export type ShortAnswerAnswer = typeof ShortAnswerAnswer.Type;

export const QuizAnswer = Schema.Union([
  MultipleChoiceAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type QuizAnswer = typeof QuizAnswer.Type;

export const TestAnswer = Schema.Union([
  MultipleChoiceAnswer,
  MultipleResponseAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type TestAnswer = typeof TestAnswer.Type;

export const AttemptAnswer = Schema.Union([
  MultipleChoiceAnswer,
  MultipleResponseAnswer,
  TrueFalseAnswer,
  ShortAnswerAnswer
]);
export type AttemptAnswer = typeof AttemptAnswer.Type;

export const MultipleChoiceCorrection = Schema.Struct({
  questionType: Schema.Literal("multiple-choice"),
  questionId: Schema.String,
  correct: Schema.Boolean,
  selectedOptionId: Schema.String,
  correctOptionId: Schema.String,
  explanation: Schema.String
});
export type MultipleChoiceCorrection = typeof MultipleChoiceCorrection.Type;

// Crédito parcial con suelo en cero en la nota mostrada; `fullyCorrect` (todo o nada) es lo que lee
// el perfil (decisión 13). Las dos reglas van separadas a propósito.
export const MultipleResponseCorrection = Schema.Struct({
  questionType: Schema.Literal("multiple-response"),
  questionId: Schema.String,
  selectedOptionIds: Schema.Array(Schema.String),
  correctOptionIds: Schema.Array(Schema.String),
  score: Schema.Number,
  maxScore: Schema.Number,
  fullyCorrect: Schema.Boolean,
  explanation: Schema.String
});
export type MultipleResponseCorrection = typeof MultipleResponseCorrection.Type;

export const TrueFalseCorrection = Schema.Struct({
  questionType: Schema.Literal("true-false"),
  questionId: Schema.String,
  correct: Schema.Boolean,
  answer: Schema.Boolean,
  correctAnswer: Schema.Boolean,
  explanation: Schema.String
});
export type TrueFalseCorrection = typeof TrueFalseCorrection.Type;

export const RubricCriterionResult = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  met: Schema.Boolean
});
export type RubricCriterionResult = typeof RubricCriterionResult.Type;

// `status: "graded"` = el juez pudo corregir y `score` tiene sentido. `"unevaluated"` = no era
// corregible (rúbrica vacía, juez caído, sin relación con la pregunta): `score` es `null`, NO 0
// (invariante 3). `"disputed"` = el alumno pulsó "esto sí lo dije" y la pregunta deja de mover el
// perfil (§6.7, defensa 1).
export const ShortAnswerCorrection = Schema.Struct({
  questionType: Schema.Literal("short-answer"),
  questionId: Schema.String,
  status: Schema.Union([
    Schema.Literal("graded"),
    Schema.Literal("unevaluated"),
    Schema.Literal("disputed")
  ]),
  score: Schema.NullOr(Schema.Number),
  maxScore: Schema.Number,
  criteria: Schema.Array(RubricCriterionResult),
  unevaluatedReason: Schema.NullOr(Schema.String),
  feedback: Schema.String
});
export type ShortAnswerCorrection = typeof ShortAnswerCorrection.Type;

// Una pregunta que el alumno no respondió: cuenta en `maxScore` y no penaliza (§6.1). No responder
// no es fallar, así que no es una corrección "incorrecta": es su propia clase.
export const BlankCorrection = Schema.Struct({
  questionType: Schema.Literal("blank"),
  questionId: Schema.String,
  maxScore: Schema.Number,
  explanation: Schema.String
});
export type BlankCorrection = typeof BlankCorrection.Type;

export const AutoQuestionCorrection = Schema.Union([
  MultipleChoiceCorrection,
  MultipleResponseCorrection,
  TrueFalseCorrection
]);
export type AutoQuestionCorrection = typeof AutoQuestionCorrection.Type;

export const QuestionCorrection = Schema.Union([
  MultipleChoiceCorrection,
  MultipleResponseCorrection,
  TrueFalseCorrection,
  ShortAnswerCorrection,
  BlankCorrection
]);
export type QuestionCorrection = typeof QuestionCorrection.Type;

export const AttemptMode = Schema.Union([
  Schema.Literal("practice"),
  Schema.Literal("exam")
]);
export type AttemptMode = typeof AttemptMode.Type;

export const AttemptInterruption = Schema.Struct({
  from: Schema.String,
  to: Schema.String
});
export type AttemptInterruption = typeof AttemptInterruption.Type;

const attemptBaseFields = {
  id: Schema.String,
  artifactId: Schema.String,
  artifactKind: Schema.Union([Schema.Literal("quiz"), Schema.Literal("test")]),
  mode: AttemptMode,
  startedAt: Schema.String,
  timeLimitSeconds: Schema.NullOr(Schema.Number),
  hintsRevealed: Schema.Array(Schema.String),
  answers: Schema.Array(AttemptAnswer),
  connectedSeconds: Schema.Number,
  lastHeartbeatAt: Schema.NullOr(Schema.String),
  interruptions: Schema.Array(AttemptInterruption)
} as const;

export const InProgressAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("in-progress")
});
export type InProgressAttempt = typeof InProgressAttempt.Type;

export const GradedAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("graded"),
  submittedAt: Schema.String,
  elapsedSeconds: Schema.Number,
  corrections: Schema.Array(QuestionCorrection),
  rawScore: Schema.Number,
  maxScore: Schema.Number,
  penalty: Schema.Number,
  displayedScore: Schema.Number,
  summary: Schema.String
});
export type GradedAttempt = typeof GradedAttempt.Type;

export const AbandonedAttempt = Schema.Struct({
  ...attemptBaseFields,
  status: Schema.Literal("abandoned"),
  reason: Schema.Union([Schema.Literal("cancelled"), Schema.Literal("expired")]),
  abandonedAt: Schema.String
});
export type AbandonedAttempt = typeof AbandonedAttempt.Type;

export const ArtifactAttempt = Schema.Union([
  InProgressAttempt,
  GradedAttempt,
  AbandonedAttempt
]);
export type ArtifactAttempt = typeof ArtifactAttempt.Type;

export const SubmitQuizAttemptInput = Schema.Struct({
  artifactKind: Schema.Literal("quiz"),
  artifactId: Schema.String,
  answers: Schema.Array(QuizAnswer)
});
export type SubmitQuizAttemptInput = typeof SubmitQuizAttemptInput.Type;

export const SubmitTestAttemptInput = Schema.Struct({
  artifactKind: Schema.Literal("test"),
  artifactId: Schema.String,
  answers: Schema.Array(TestAnswer)
});
export type SubmitTestAttemptInput = typeof SubmitTestAttemptInput.Type;

export const SubmitAttemptInput = Schema.Union([
  SubmitQuizAttemptInput,
  SubmitTestAttemptInput
]);
export type SubmitAttemptInput = typeof SubmitAttemptInput.Type;

export const ListArtifactsInput = Schema.Struct({
  kind: Schema.optional(Schema.Union([
    Schema.Literal("note"),
    Schema.Literal("quiz"),
    Schema.Literal("test")
  ]))
});
export type ListArtifactsInput = typeof ListArtifactsInput.Type;

// Un fichero de artefacto que no se pudo decodificar. El listado lo devuelve junto a los buenos:
// callar cuál falla es el fallo silencioso que prohíbe la invariante 3 (F2-07).
export interface UnreadableArtifactFile {
  readonly fileName: string;
  readonly reason: string;
}

export interface ArtifactListing {
  readonly artifacts: readonly Artifact[];
  readonly unreadable: readonly UnreadableArtifactFile[];
}

export class ArtifactNotFound extends Data.TaggedError("ArtifactNotFound")<{
  readonly artifactId: string;
}> {}

export class AttemptNotFound extends Data.TaggedError("AttemptNotFound")<{
  readonly attemptId: string;
}> {}

export class ArtifactTypeMismatch extends Data.TaggedError("ArtifactTypeMismatch")<{
  readonly artifactId: string;
  readonly expected: "quiz" | "test";
  readonly actual: ArtifactKind;
}> {}

export class QuestionNotFound extends Data.TaggedError("QuestionNotFound")<{
  readonly questionId: string;
}> {}

export class AnswerTypeMismatch extends Data.TaggedError("AnswerTypeMismatch")<{
  readonly questionId: string;
  readonly expected: string;
  readonly actual: string;
}> {}

export class ArtifactRepositoryStorageError extends Data.TaggedError("ArtifactRepositoryStorageError")<{
  readonly reason: unknown;
}> {}

// Un material tiene como mucho un apunte (fase 2, decisión 19). Lo comprueba `NoteGenerationService`
// antes de guardar; para rehacer el apunte hay que borrar el que hay. No es un error del repositorio
// de artefactos: `createArtifact` ya no crea apuntes (decisión 25).
export class MaterialAlreadyHasNote extends Data.TaggedError("MaterialAlreadyHasNote")<{
  readonly materialId: string;
  readonly noteId: string;
}> {}

// Se intentó guardar una prueba con más preguntas que `LIMITS.maxQuestionsPerArtifact` (invariante
// 11). Se rechaza en voz alta al guardar, nunca se recorta en silencio.
export class TooManyQuestions extends Data.TaggedError("TooManyQuestions")<{
  readonly artifactId: string;
  readonly ceiling: number;
  readonly received: number;
}> {}

export class ArtifactRepositorySerializationError extends Data.TaggedError("ArtifactRepositorySerializationError")<{
  readonly reason: unknown;
}> {}

export type ArtifactRepositoryError =
  | ArtifactNotFound
  | AttemptNotFound
  | ArtifactTypeMismatch
  | QuestionNotFound
  | AnswerTypeMismatch
  | TooManyQuestions
  | ArtifactRepositoryStorageError
  | ArtifactRepositorySerializationError;

export interface ArtifactRepository {
  readonly createArtifact: (input: CreateArtifactInput) => Effect.Effect<Artifact, ArtifactRepositoryError>;
  readonly saveArtifact: (artifact: Artifact) => Effect.Effect<void, ArtifactRepositoryError>;
  readonly getArtifact: (id: string) => Effect.Effect<Artifact, ArtifactRepositoryError>;
  readonly deleteArtifact: (id: string) => Effect.Effect<void, ArtifactRepositoryError>;
  readonly listArtifacts: (input?: ListArtifactsInput) => Effect.Effect<ArtifactListing, ArtifactRepositoryError>;
  readonly submitAttempt: (input: SubmitAttemptInput) => Effect.Effect<ArtifactAttempt, ArtifactRepositoryError>;
  readonly saveAttempt: (attempt: ArtifactAttempt) => Effect.Effect<void, ArtifactRepositoryError>;
  readonly getAttempt: (id: string) => Effect.Effect<ArtifactAttempt, ArtifactRepositoryError>;
  readonly listAttempts: (artifactId?: string) => Effect.Effect<readonly ArtifactAttempt[], ArtifactRepositoryError>;
  readonly gradeAttempt: (attemptId: string) => Effect.Effect<ArtifactAttempt, ArtifactRepositoryError>;
}

export const ArtifactRepository = Context.Service<ArtifactRepository>(
  "@proxus/server/artifacts/ArtifactRepository"
);

// `artifacts create` se retira en el tramo 3D (decisión 4). Hasta entonces sigue creando quiz y test,
// pero el alcance, el origen y el tiempo de examen los pone luego la generación de verdad
// (`AssessmentGenerationService`, tramo 3B): aquí van marcadores.
const placeholderScope = (): AssessmentScope => ({ materialId: "", topicId: null, topicLabel: "" });

export const makeArtifact = (input: CreateArtifactInput): Artifact => {
  const id = crypto.randomUUID();
  const shared = {
    id,
    scope: placeholderScope(),
    origin: "material" as const,
    createdAt: new Date().toISOString(),
    examTimeLimitSeconds: 0
  };
  switch (input.kind) {
    case "quiz":
      return { ...input, ...shared };
    case "test":
      return { ...input, ...shared };
  }
};

// El intento se crea al empezarlo (decisión 8). En el camino de `artifacts submit` / `POST
// /artifacts/:id/submit` (que se rehace en el tramo 3B) se sintetiza un intento de práctica: sin
// reloj, sin pistas, con las respuestas ya dentro.
export const makeInProgressAttempt = (input: SubmitAttemptInput): InProgressAttempt => ({
  id: crypto.randomUUID(),
  artifactId: input.artifactId,
  artifactKind: input.artifactKind,
  mode: "practice",
  startedAt: new Date().toISOString(),
  timeLimitSeconds: null,
  hintsRevealed: [],
  answers: input.answers,
  connectedSeconds: 0,
  lastHeartbeatAt: null,
  interruptions: [],
  status: "in-progress"
});

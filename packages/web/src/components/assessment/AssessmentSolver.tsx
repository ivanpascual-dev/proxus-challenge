import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  LIMITS,
  type GradedAttempt,
  type InProgressAttempt,
  type QuestionCorrection,
  type SolvableAssessment,
  type SolvableQuestion,
  type TestAnswer
} from "@proxus/shared";
import { useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import {
  disputeAction,
  revealHintAction,
  solvableAssessmentQuery,
  startAttemptAction,
  submitAttemptAction
} from "../../domain/assessments/atoms.ts";
import { QuestionSourceLine } from "./QuestionSourceLine.tsx";

const questionTypeLabels = {
  "multiple-choice": "respuesta única",
  "multiple-response": "respuesta múltiple",
  "true-false": "verdadero/falso",
  "short-answer": "respuesta corta"
} as const;

interface LocalAnswers {
  readonly choice: Record<string, string>;
  readonly multi: Record<string, readonly string[]>;
  readonly text: Record<string, string>;
}

const emptyAnswers: LocalAnswers = { choice: {}, multi: {}, text: {} };

// --- Entrada al solucionador ----------------------------------------------------------------------

export function AssessmentSolver({
  artifactId,
  title,
  onExit
}: {
  readonly artifactId: string;
  readonly title: string;
  readonly onExit: () => void;
}) {
  const solvable = useAtomValue(solvableAssessmentQuery(artifactId));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="rounded-full border border-border-strong px-4 py-1.5 text-body text-sm hover:border-brand"
        >
          ← Volver a la lista
        </button>
      </div>
      {AsyncResult.matchWithError(solvable, {
        onInitial: () => <p className="text-muted">Cargando la prueba…</p>,
        onError: (error) => <p className="text-danger-ink">No se pudo cargar la prueba: {String(error)}</p>,
        onDefect: (defect) => <p className="text-danger-ink">No se pudo cargar la prueba: {String(defect)}</p>,
        onSuccess: ({ value }) => <PracticeRun assessment={value} title={title} />
      })}
    </div>
  );
}

// --- La sesión de práctica -----------------------------------------------------------------------

function PracticeRun({ assessment, title }: { readonly assessment: SolvableAssessment; readonly title: string }) {
  const [attempt, setAttempt] = useState<InProgressAttempt | GradedAttempt | null>(null);
  const [answers, setAnswers] = useState<LocalAnswers>(emptyAnswers);
  const [hints, setHints] = useState<Record<string, string>>({});
  const [hintErrors, setHintErrors] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const start = useAtomSet(startAttemptAction, { mode: "promise" });
  const reveal = useAtomSet(revealHintAction, { mode: "promise" });
  const submit = useAtomSet(submitAttemptAction, { mode: "promise" });
  const dispute = useAtomSet(disputeAction, { mode: "promise" });

  const graded = attempt?.status === "graded" ? attempt : null;
  const locked = attempt !== null;

  const onStart = async () => {
    if (starting) {
      return;
    }
    setStarting(true);
    setError(undefined);
    try {
      const result = await start({ artifactId: assessment.id, mode: "practice" });
      if (result.status === "in-progress") {
        setAttempt(result);
      } else {
        setError("El servidor no devolvió un intento en curso.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setStarting(false);
    }
  };

  const onRevealHint = async (questionId: string) => {
    if (attempt === null || hints[questionId] !== undefined) {
      return;
    }
    try {
      const result = await reveal({ artifactId: assessment.id, attemptId: attempt.id, questionId });
      setHints((current) => ({ ...current, [questionId]: result.hint }));
    } catch (cause) {
      setHintErrors((current) => ({
        ...current,
        [questionId]: cause instanceof Error ? cause.message : String(cause)
      }));
    }
  };

  const onSubmit = async () => {
    if (attempt === null || submitting) {
      return;
    }
    setSubmitting(true);
    setError(undefined);
    try {
      const result = await submit({
        artifactId: assessment.id,
        attemptId: attempt.id,
        answers: buildAnswers(assessment.questions, answers)
      });
      if (result.status === "graded") {
        setAttempt(result);
      } else {
        setError("El servidor no devolvió el intento corregido.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const onDispute = async (questionId: string) => {
    if (attempt === null) {
      return;
    }
    try {
      const result = await dispute({ attemptId: attempt.id, questionId });
      if (result.status === "graded") {
        setAttempt(result);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const unanswered = countUnanswered(assessment.questions, answers);

  return (
    <article className="mx-auto max-w-3xl pb-8">
      <header className="mb-5 rounded-3xl border border-border bg-surface p-6">
        <p className="mb-2 font-bold text-brand text-xs uppercase tracking-widest">
          {assessment.kind === "quiz" ? "Control" : "Examen"} · práctica
        </p>
        <h2 className="font-bold text-2xl text-heading">{title}</h2>
        <p className="mt-2 text-muted text-sm">
          En práctica no hay reloj ni penalización. Puedes abrir las pistas, mirar el material en las
          otras pestañas y preguntarle al tutor. La corrección sale al entregar.
        </p>
      </header>

      {attempt === null
        ? (
            <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
              <div>
                <h3 className="font-bold text-heading text-lg">
                  {assessment.questions.length} {assessment.questions.length === 1 ? "pregunta" : "preguntas"}
                </h3>
                <p className="mt-2 max-w-md text-muted text-sm">
                  Empezar cuenta como un intento (tienes {LIMITS.maxPracticeAttemptsPerAssessment} en
                  práctica por prueba). El intento se guarda aunque lo dejes a medias.
                </p>
                <button
                  type="button"
                  className="mt-4 rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void onStart()}
                  disabled={starting}
                >
                  {starting ? "Empezando…" : "Empezar la práctica"}
                </button>
              </div>
            </div>
          )
        : (
            <div className="grid gap-4">
              {assessment.questions.map((question, index) => (
                <QuestionCard
                  key={question.id}
                  index={index}
                  question={question}
                  answers={answers}
                  setAnswers={setAnswers}
                  locked={locked}
                  hint={hints[question.id]}
                  hintError={hintErrors[question.id]}
                  onRevealHint={() => void onRevealHint(question.id)}
                  correction={graded?.corrections.find((item) => item.questionId === question.id)}
                  onDispute={() => void onDispute(question.id)}
                />
              ))}
            </div>
          )}

      {error !== undefined && (
        <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/15 p-4 text-danger-ink">{error}</p>
      )}

      {graded !== null && <AttemptSummary attempt={graded} />}

      {attempt !== null && graded === null && (
        <footer className="sticky bottom-0 mt-6 rounded-3xl border border-border bg-canvas/95 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">
              {unanswered === 0
                ? "Todo respondido."
                : `${unanswered} ${unanswered === 1 ? "pregunta sin responder" : "preguntas sin responder"} (contarán como en blanco).`}
            </p>
            <button
              type="button"
              className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void onSubmit()}
              disabled={submitting}
            >
              {submitting ? "Corrigiendo…" : "Entregar y corregir"}
            </button>
          </div>
        </footer>
      )}
    </article>
  );
}

// --- Una pregunta --------------------------------------------------------------------------------

function QuestionCard({
  index,
  question,
  answers,
  setAnswers,
  locked,
  hint,
  hintError,
  onRevealHint,
  correction,
  onDispute
}: {
  readonly index: number;
  readonly question: SolvableQuestion;
  readonly answers: LocalAnswers;
  readonly setAnswers: React.Dispatch<React.SetStateAction<LocalAnswers>>;
  readonly locked: boolean;
  readonly hint: string | undefined;
  readonly hintError: string | undefined;
  readonly onRevealHint: () => void;
  readonly correction: QuestionCorrection | undefined;
  readonly onDispute: () => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-muted text-sm">Pregunta {index + 1} · {questionTypeLabels[question.type]}</p>
          <h3 className="font-semibold text-heading text-lg">{question.prompt}</h3>
        </div>
        {correction !== undefined && <CorrectionBadge correction={correction} />}
      </div>

      <QuestionInput question={question} answers={answers} setAnswers={setAnswers} disabled={locked} />

      <HintDisclosure
        hasHint={question.hasHint}
        hint={hint}
        hintError={hintError}
        onReveal={onRevealHint}
      />

      {correction !== undefined && (
        <CorrectionDetails correction={correction} question={question} onDispute={onDispute} />
      )}

      <QuestionSourceLine source={question.source} />
    </section>
  );
}

function QuestionInput({
  question,
  answers,
  setAnswers,
  disabled
}: {
  readonly question: SolvableQuestion;
  readonly answers: LocalAnswers;
  readonly setAnswers: React.Dispatch<React.SetStateAction<LocalAnswers>>;
  readonly disabled: boolean;
}) {
  if (question.type === "multiple-choice") {
    const value = answers.choice[question.id] ?? "";
    return (
      <div className="grid gap-2">
        {question.options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-canvas/70 p-3 hover:border-brand">
            <input
              type="radio"
              name={question.id}
              checked={value === option.id}
              disabled={disabled}
              onChange={() => setAnswers((current) => ({
                ...current,
                choice: { ...current.choice, [question.id]: option.id }
              }))}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "multiple-response") {
    const selected = answers.multi[question.id] ?? [];
    return (
      <div className="grid gap-2">
        <p className="text-muted text-xs">Marca todas las que correspondan.</p>
        {question.options.map((option) => (
          <label key={option.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-canvas/70 p-3 hover:border-brand">
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              disabled={disabled}
              onChange={() => setAnswers((current) => {
                const prev = current.multi[question.id] ?? [];
                const next = prev.includes(option.id)
                  ? prev.filter((id) => id !== option.id)
                  : [...prev, option.id];
                return { ...current, multi: { ...current.multi, [question.id]: next } };
              })}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "true-false") {
    const value = answers.choice[question.id] ?? "";
    return (
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        {([["true", "Verdadero"], ["false", "Falso"]] as const).map(([nextValue, label]) => (
          <label key={nextValue} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-canvas/70 p-3 hover:border-brand">
            <input
              type="radio"
              name={`tf-${question.id}`}
              checked={value === nextValue}
              disabled={disabled}
              onChange={() => setAnswers((current) => ({
                ...current,
                choice: { ...current.choice, [question.id]: nextValue }
              }))}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    );
  }

  const text = answers.text[question.id] ?? "";
  return (
    <div>
      <textarea
        className="min-h-32 w-full rounded-2xl border border-border-strong bg-canvas p-3 text-heading outline-none focus:border-brand disabled:opacity-70"
        value={text}
        disabled={disabled}
        maxLength={LIMITS.maxOpenAnswerCharacters}
        onChange={(event) => setAnswers((current) => ({
          ...current,
          text: { ...current.text, [question.id]: event.currentTarget.value }
        }))}
        placeholder="Escribe tu respuesta…"
      />
      <p className="mt-1 text-muted text-xs">
        {text.length} / {LIMITS.maxOpenAnswerCharacters} caracteres
      </p>
    </div>
  );
}

function HintDisclosure({
  hasHint,
  hint,
  hintError,
  onReveal
}: {
  readonly hasHint: boolean;
  readonly hint: string | undefined;
  readonly hintError: string | undefined;
  readonly onReveal: () => void;
}) {
  if (!hasHint) {
    return <p className="mt-3 text-muted text-xs">Esta pregunta no tiene pista.</p>;
  }

  return (
    <details
      className="mt-3 rounded-2xl border border-border bg-canvas/60 p-3 text-sm"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          onReveal();
        }
      }}
    >
      <summary className="cursor-pointer font-medium text-body marker:text-brand">Pista</summary>
      {hintError !== undefined
        ? <p className="mt-2 text-danger-ink">No se pudo abrir la pista: {hintError}</p>
        : hint === undefined
          ? <p className="mt-2 text-muted">Abriendo la pista…</p>
          : <p className="mt-2 text-body">{hint}</p>}
    </details>
  );
}

// --- Corrección ---------------------------------------------------------------------------------

function CorrectionBadge({ correction }: { readonly correction: QuestionCorrection }) {
  if (correction.questionType === "short-answer") {
    if (correction.status === "disputed") {
      return <span className="rounded-full bg-border px-3 py-1 font-semibold text-muted text-sm">Retirada del perfil</span>;
    }
    if (correction.status === "unevaluated" || correction.score === null) {
      return <span className="rounded-full bg-warning/20 px-3 py-1 font-semibold text-warning-ink text-sm">Sin evaluar</span>;
    }
    return <span className="rounded-full bg-brand px-3 py-1 font-semibold text-on-brand text-sm">{correction.score}/{correction.maxScore}</span>;
  }

  if (correction.questionType === "multiple-response") {
    return (
      <span className={`rounded-full px-3 py-1 font-semibold text-sm ${
        correction.fullyCorrect ? "bg-success/20 text-success-ink" : "bg-danger/20 text-danger-ink"
      }`}>
        {correction.score}/{correction.maxScore}
      </span>
    );
  }

  if (correction.questionType === "blank") {
    return <span className="rounded-full bg-border px-3 py-1 font-semibold text-muted text-sm">Sin responder</span>;
  }

  return correction.correct
    ? <span className="rounded-full bg-success/20 px-3 py-1 font-semibold text-success-ink text-sm">Correcta</span>
    : <span className="rounded-full bg-danger/20 px-3 py-1 font-semibold text-danger-ink text-sm">Revisar</span>;
}

function CorrectionDetails({
  correction,
  question,
  onDispute
}: {
  readonly correction: QuestionCorrection;
  readonly question: SolvableQuestion;
  readonly onDispute: () => void;
}) {
  const optionText = (optionId: string): string => {
    if (question.type !== "multiple-choice" && question.type !== "multiple-response") {
      return optionId;
    }
    return question.options.find((option) => option.id === optionId)?.text ?? optionId;
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-canvas p-4 text-sm">
      {correction.questionType === "multiple-choice" && (
        <>
          <p className="text-body">Respuesta correcta: <strong>{optionText(correction.correctOptionId)}</strong></p>
          <p className="mt-2 text-muted">{correction.explanation}</p>
        </>
      )}
      {correction.questionType === "multiple-response" && (
        <>
          <p className="text-body">
            Correctas: <strong>{correction.correctOptionIds.map(optionText).join(", ")}</strong>
          </p>
          <p className="mt-2 text-muted">{correction.explanation}</p>
        </>
      )}
      {correction.questionType === "true-false" && (
        <>
          <p className="text-body">Respuesta correcta: <strong>{correction.correctAnswer ? "Verdadero" : "Falso"}</strong></p>
          <p className="mt-2 text-muted">{correction.explanation}</p>
        </>
      )}
      {correction.questionType === "blank" && (
        <p className="text-muted">{correction.explanation}</p>
      )}
      {correction.questionType === "short-answer" && (
        <ShortAnswerCorrectionBody correction={correction} onDispute={onDispute} />
      )}
    </div>
  );
}

function ShortAnswerCorrectionBody({
  correction,
  onDispute
}: {
  readonly correction: Extract<QuestionCorrection, { readonly questionType: "short-answer" }>;
  readonly onDispute: () => void;
}) {
  return (
    <div className="grid gap-3">
      {correction.status === "unevaluated" && correction.unevaluatedReason !== null && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-2 text-warning-ink">
          El juez no pudo corregir esta respuesta: {correction.unevaluatedReason}. No cuenta ni a favor ni en contra.
        </p>
      )}
      {correction.status === "disputed" && (
        <p className="rounded-xl border border-border bg-surface p-2 text-muted">
          Marcaste "esto sí lo dije": esta pregunta ya no mueve tu perfil, en ninguna dirección.
        </p>
      )}
      {correction.criteria.length > 0 && (
        <ul className="grid gap-1">
          {correction.criteria.map((criterion) => (
            <li key={criterion.id} className="flex items-start gap-2">
              <span className={criterion.met ? "text-success-ink" : "text-danger-ink"}>
                {criterion.met ? "✓" : "✗"}
              </span>
              <span className="text-body">{criterion.text}</span>
            </li>
          ))}
        </ul>
      )}
      {correction.feedback.length > 0 && <p className="text-muted">{correction.feedback}</p>}
      {correction.status !== "disputed" && (
        <div>
          <button
            type="button"
            onClick={onDispute}
            className="rounded-full border border-border-strong px-4 py-1.5 text-body text-sm hover:border-brand"
          >
            Esto sí lo dije
          </button>
        </div>
      )}
    </div>
  );
}

function AttemptSummary({ attempt }: { readonly attempt: GradedAttempt }) {
  return (
    <section className="mt-6 rounded-3xl border border-success/40 bg-success/10 p-5">
      <p className="font-bold text-success-ink text-xl">
        Nota: {attempt.displayedScore} / 10
      </p>
      <p className="mt-1 text-success-ink text-sm">
        Puntuación bruta {attempt.rawScore} / {attempt.maxScore}
        {attempt.penalty > 0 && ` · penalización ${attempt.penalty}`}
      </p>
      <p className="mt-2 text-success-ink">{attempt.summary}</p>
    </section>
  );
}

// --- Construcción de la entrega ----------------------------------------------------------------

function buildAnswers(
  questions: readonly SolvableQuestion[],
  answers: LocalAnswers
): readonly TestAnswer[] {
  const built: TestAnswer[] = [];
  for (const question of questions) {
    if (question.type === "multiple-choice") {
      const selectedOptionId = answers.choice[question.id];
      if (selectedOptionId !== undefined && selectedOptionId.length > 0) {
        built.push({ questionType: "multiple-choice", questionId: question.id, selectedOptionId });
      }
    } else if (question.type === "multiple-response") {
      const selectedOptionIds = answers.multi[question.id] ?? [];
      if (selectedOptionIds.length > 0) {
        built.push({ questionType: "multiple-response", questionId: question.id, selectedOptionIds });
      }
    } else if (question.type === "true-false") {
      const value = answers.choice[question.id];
      if (value === "true" || value === "false") {
        built.push({ questionType: "true-false", questionId: question.id, answer: value === "true" });
      }
    } else {
      const answer = (answers.text[question.id] ?? "").trim();
      if (answer.length > 0) {
        built.push({ questionType: "short-answer", questionId: question.id, answer });
      }
    }
  }
  return built;
}

function countUnanswered(questions: readonly SolvableQuestion[], answers: LocalAnswers): number {
  return questions.length - buildAnswers(questions, answers).length;
}

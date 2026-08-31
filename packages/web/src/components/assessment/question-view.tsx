import {
  LIMITS,
  type GradedAttempt,
  type QuestionCorrection,
  type QuestionReviewReason,
  type SolvableQuestion,
  type TestAnswer
} from "@proxus/shared";
import { QuestionSourceLine } from "./QuestionSourceLine.tsx";

// El motivo de repaso, por pregunta (§6.11, F3-33): la señal del perfil que trajo la pregunta. Nunca
// un número resumen (invariante 5).
const reviewReasonLabel: Record<QuestionReviewReason, string> = {
  fallada: "Está en el repaso porque fallaste este tema",
  pista: "Está en el repaso porque abriste una pista en este tema",
  marcada: "Está en el repaso porque marcaste este tema como importante"
};

// La vista de una pregunta y su corrección. La comparten el solucionador de práctica
// (`AssessmentSolver`) y el panel de examen a pantalla completa (`ExamRun`): la corrección es idéntica
// en los dos modos (F3-19), solo cambian el reloj, la penalización y las pistas, que viven fuera de
// aquí. En modo examen no se pinta la pista (decisión 10).

export const questionTypeLabels = {
  "multiple-choice": "respuesta única",
  "multiple-response": "respuesta múltiple",
  "true-false": "verdadero/falso",
  "short-answer": "respuesta corta"
} as const;

export interface LocalAnswers {
  readonly choice: Record<string, string>;
  readonly multi: Record<string, readonly string[]>;
  readonly text: Record<string, string>;
}

export const emptyAnswers: LocalAnswers = { choice: {}, multi: {}, text: {} };

export function QuestionCard({
  index,
  question,
  answers,
  setAnswers,
  locked,
  hint,
  hintError,
  onRevealHint,
  showSource = true,
  correction,
  onDispute
}: {
  readonly index: number;
  readonly question: SolvableQuestion;
  readonly answers: LocalAnswers;
  readonly setAnswers: React.Dispatch<React.SetStateAction<LocalAnswers>>;
  readonly locked: boolean;
  // Pista solo en práctica: si no llega `onRevealHint`, no se pinta el desplegable (decisión 10).
  readonly hint?: string | undefined;
  readonly hintError?: string | undefined;
  readonly onRevealHint?: (() => void) | undefined;
  // La cita (tema y páginas) se pinta en práctica y en el Control; en el Examen real solo van las
  // preguntas.
  readonly showSource?: boolean;
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

      {showSource && question.source.reviewReason !== null && (
        <p className="mb-3 inline-block rounded-full bg-brand-soft px-3 py-1 text-heading text-xs">
          {reviewReasonLabel[question.source.reviewReason]}
        </p>
      )}

      <QuestionInput question={question} answers={answers} setAnswers={setAnswers} disabled={locked} />

      {onRevealHint !== undefined && (
        <HintDisclosure
          hasHint={question.hasHint}
          hint={hint}
          hintError={hintError}
          onReveal={onRevealHint}
        />
      )}

      {correction !== undefined && (
        <CorrectionDetails correction={correction} question={question} onDispute={onDispute} />
      )}

      {showSource && <QuestionSourceLine source={question.source} />}
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
        onChange={(event) => {
          // El valor se lee ya, no dentro del updater: React anula `currentTarget` en cuanto el
          // handler retorna, y el updater de `setAnswers` corre después.
          const value = event.currentTarget.value;
          setAnswers((current) => ({
            ...current,
            text: { ...current.text, [question.id]: value }
          }));
        }}
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

// La nota mostrada ya viene redondeada del servidor; la bruta y la penalización pueden traer
// decimales largos (un tercio por fallo en examen). Se enseñan con dos decimales como mucho.
const round2 = (value: number): number => Math.round(value * 100) / 100;

export function AttemptSummary({ attempt }: { readonly attempt: GradedAttempt }) {
  return (
    <section className="mt-6 rounded-3xl border border-success/40 bg-success/10 p-5">
      <p className="font-bold text-success-ink text-xl">
        Nota: {attempt.displayedScore} / 10
      </p>
      <p className="mt-1 text-success-ink text-sm">
        Puntuación bruta {round2(attempt.rawScore)} / {attempt.maxScore}
        {attempt.penalty > 0 && ` · penalización ${round2(attempt.penalty)}`}
      </p>
      <p className="mt-2 text-success-ink">{attempt.summary}</p>
    </section>
  );
}

// --- Construcción de la entrega ----------------------------------------------------------------

export function buildAnswers(
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

export function countUnanswered(questions: readonly SolvableQuestion[], answers: LocalAnswers): number {
  return questions.length - buildAnswers(questions, answers).length;
}

// El camino inverso de `buildAnswers`: las respuestas ya guardadas de un intento vuelven a la forma
// local que `QuestionCard` pinta. Lo usa el historial para reabrir un intento corregido.
export function answersFromStored(stored: readonly TestAnswer[]): LocalAnswers {
  const choice: Record<string, string> = {};
  const multi: Record<string, readonly string[]> = {};
  const text: Record<string, string> = {};
  for (const answer of stored) {
    if (answer.questionType === "multiple-choice") {
      choice[answer.questionId] = answer.selectedOptionId;
    } else if (answer.questionType === "true-false") {
      choice[answer.questionId] = answer.answer ? "true" : "false";
    } else if (answer.questionType === "multiple-response") {
      multi[answer.questionId] = answer.selectedOptionIds;
    } else {
      text[answer.questionId] = answer.answer;
    }
  }
  return { choice, multi, text };
}

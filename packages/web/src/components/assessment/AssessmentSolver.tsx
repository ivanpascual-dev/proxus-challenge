import { useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  LIMITS,
  type GradedAttempt,
  type InProgressAttempt,
  type SolvableAssessment
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
import {
  AttemptSummary,
  buildAnswers,
  countUnanswered,
  emptyAnswers,
  QuestionCard,
  type LocalAnswers
} from "./question-view.tsx";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";
import { ActionButton } from "../ui/ActionButton.tsx";

// --- Entrada al solucionador ----------------------------------------------------------------------

export function AssessmentSolver({
  artifactId,
  title,
  onExit,
  onOpenCitation
}: {
  readonly artifactId: string;
  readonly title: string;
  readonly onExit: () => void;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}) {
  const solvable = useAtomValue(solvableAssessmentQuery(artifactId));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <ActionButton
          icon="chevron-left"
          variant="brand"
          size="compact"
          onClick={onExit}
        >
          Volver a la lista
        </ActionButton>
      </div>
      {AsyncResult.matchWithError(solvable, {
        onInitial: () => <p className="text-muted">Cargando la prueba…</p>,
        onError: (error) => {
          const notice = describeFailure(error, { area: "assessments", action: "load" }, "AssessmentSolver");
          return <p className="text-danger-ink">{notice.title} {notice.description}</p>;
        },
        onDefect: (defect) => <p className="text-danger-ink">No se pudo cargar la prueba: {DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => <PracticeRun assessment={value} title={title} onOpenCitation={onOpenCitation} />
      })}
    </div>
  );
}

// --- La sesión de práctica -----------------------------------------------------------------------

function PracticeRun({
  assessment,
  title,
  onOpenCitation
}: {
  readonly assessment: SolvableAssessment;
  readonly title: string;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}) {
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
  // Se responde mientras el intento está en curso; solo se congela al corregir (§F3-11: la corrección
  // sale al entregar, no antes).
  const locked = graded !== null;

  const onStart = async () => {
    if (starting) {
      return;
    }
    setStarting(true);
    setError(undefined);
    try {
      const result = await start({ artifactId: assessment.id });
      if (result.status === "in-progress") {
        setAttempt(result);
      } else {
        setError("El servidor no devolvió un intento en curso.");
      }
    } catch (cause) {
      const notice = describeFailure(cause, { area: "attempts", action: "start" }, "AssessmentSolver");
      setError(notice.description ?? notice.title);
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
      const notice = describeFailure(cause, { area: "assessments", action: "hint" }, "AssessmentSolver");
      setHintErrors((current) => ({
        ...current,
        [questionId]: notice.description ?? notice.title
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
      const notice = describeFailure(cause, { area: "attempts", action: "submit" }, "AssessmentSolver");
      setError(notice.description ?? notice.title);
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
      const notice = describeFailure(cause, { area: "attempts", action: "submit" }, "AssessmentSolver");
      setError(notice.description ?? notice.title);
    }
  };

  const unanswered = countUnanswered(assessment.questions, answers);

  return (
    <article className="mx-auto max-w-3xl pb-8">
      <header className="mb-5 border-border border-b pb-4">
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
            <div className="grid place-items-center border border-dashed border-border bg-surface/40 p-10 text-center">
              <div>
                <h3 className="font-bold text-heading text-lg">
                  {assessment.questions.length} {assessment.questions.length === 1 ? "pregunta" : "preguntas"}
                </h3>
                <p className="mt-2 max-w-md text-muted text-sm">
                  Empezar cuenta como un intento (tienes {LIMITS.maxPracticeAttemptsPerAssessment} en
                  práctica por prueba). El intento se guarda aunque lo dejes a medias.
                </p>
                <ActionButton
                  icon="play"
                  variant="primary"
                  className="mt-4"
                  onClick={() => void onStart()}
                  disabled={starting}
                >
                  {starting ? "Empezando…" : "Empezar la práctica"}
                </ActionButton>
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
                  onOpenCitation={onOpenCitation}
                />
              ))}
            </div>
          )}

      {error !== undefined && (
        <p className="mt-4 border border-danger/40 bg-danger/15 p-4 text-danger-ink">{error}</p>
      )}

      {graded !== null && <AttemptSummary attempt={graded} />}

      {attempt !== null && graded === null && (
        <footer className="sticky bottom-0 mt-6 border-border border-t bg-canvas/95 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">
              {unanswered === 0
                ? "Todo respondido."
                : `${unanswered} ${unanswered === 1 ? "pregunta sin responder" : "preguntas sin responder"} (contarán como en blanco).`}
            </p>
            <ActionButton
              icon="check-circle"
              variant="primary"
              onClick={() => void onSubmit()}
              disabled={submitting}
            >
              {submitting ? "Corrigiendo…" : "Entregar y corregir"}
            </ActionButton>
          </div>
        </footer>
      )}
    </article>
  );
}

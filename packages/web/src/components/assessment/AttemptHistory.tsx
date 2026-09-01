import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { AbandonedAttempt, ArtifactAttempt, GradedAttempt, SolvableAssessment } from "@proxus/shared";
import { useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { attemptHistoryQuery, disputeAction, solvableAssessmentQuery } from "../../domain/assessments/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";
import { answersFromStored, AttemptSummary, type LocalAnswers, QuestionCard } from "./question-view.tsx";

// El historial de una prueba (paso 23 del plan): todos sus intentos, los abandonados incluidos con su
// motivo y sus interrupciones. Un intento corregido se abre entero con sus correcciones; uno
// abandonado NO se corrige (decisión 23), así que solo enseña cuándo y por qué se cerró.

export function AttemptHistory({
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
  const history = useAtomValue(attemptHistoryQuery(artifactId));
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="font-medium text-brand text-sm transition hover:underline active:scale-[0.98]"
        >
          ← Volver a la lista
        </button>
      </div>

      <h2 className="mb-1 font-bold text-heading text-xl">{title}</h2>
      <p className="mb-4 text-muted text-sm">Historial de intentos.</p>

      {AsyncResult.matchWithError(history, {
        onInitial: () => <p className="text-muted">Cargando el historial…</p>,
        onError: (error) => {
          const notice = describeFailure(error, { area: "assessments", action: "history" }, "AttemptHistory");
          return <p className="text-danger-ink">{notice.title} {notice.description}</p>;
        },
        onDefect: () => <p className="text-danger-ink">{DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => {
          if (value.length === 0) {
            return (
              <p className=" border border-dashed border-border bg-surface/40 p-6 text-center text-muted">
                Esta prueba no tiene intentos todavía.
              </p>
            );
          }
          const sorted = [...value].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
          const open = openId === null ? null : sorted.find((attempt) => attempt.id === openId) ?? null;

          if (open !== null) {
            return (
              <OpenAttempt
                attempt={open}
                artifactId={artifactId}
                onBack={() => setOpenId(null)}
                onOpenCitation={onOpenCitation}
              />
            );
          }

          return (
            <ul className="grid gap-3">
              {sorted.map((attempt) => (
                <AttemptRow
                  key={attempt.id}
                  attempt={attempt}
                  onOpen={attempt.status === "in-progress" ? undefined : () => setOpenId(attempt.id)}
                />
              ))}
            </ul>
          );
        }
      })}
    </div>
  );
}

// --- Fila del historial ------------------------------------------------------------------------

function AttemptRow({
  attempt,
  onOpen
}: {
  readonly attempt: ArtifactAttempt;
  readonly onOpen: (() => void) | undefined;
}) {
  return (
    <li className="border-border border-b py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-muted text-xs uppercase tracking-widest">
            {attempt.mode === "practice" ? "Práctica" : "Examen"} · {formatDate(attempt.startedAt)}
          </p>
          <p className="font-semibold text-heading">{statusLine(attempt)}</p>
          {attempt.status === "abandoned" && attempt.interruptions.length > 0 && (
            <p className="mt-1 text-muted text-sm">{interruptionLabel(attempt.interruptions.length)}</p>
          )}
        </div>
        {onOpen !== undefined && (
          <button
            type="button"
            className="font-medium text-brand text-sm transition hover:underline active:scale-[0.98]"
            onClick={onOpen}
          >
            {attempt.status === "graded" ? "Ver correcciones" : "Ver detalle"}
          </button>
        )}
      </div>
    </li>
  );
}

function statusLine(attempt: ArtifactAttempt): string {
  if (attempt.status === "graded") {
    const time = formatSeconds(attempt.elapsedSeconds);
    const penalty = attempt.penalty > 0 ? ` · penalización ${round2(attempt.penalty)}` : "";
    return `Nota ${round2(attempt.displayedScore)} / 10 · ${time}${penalty}`;
  }
  if (attempt.status === "abandoned") {
    return attempt.reason === "cancelled" ? "Cancelado por ti" : "Caducado al agotarse el tiempo";
  }
  return "En curso";
}

// --- Un intento abierto ------------------------------------------------------------------------

function OpenAttempt({
  attempt,
  artifactId,
  onBack,
  onOpenCitation
}: {
  readonly attempt: ArtifactAttempt;
  readonly artifactId: string;
  readonly onBack: () => void;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}) {
  const solvable = useAtomValue(solvableAssessmentQuery(artifactId));

  return (
    <article className="mx-auto max-w-3xl pb-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 font-medium text-brand text-sm transition hover:underline active:scale-[0.98]"
      >
        ← Volver al historial
      </button>

      <header className="mb-5 border-border border-b pb-4">
        <p className="mb-2 font-bold text-brand text-xs uppercase tracking-widest">
          {attempt.mode === "practice" ? "Práctica" : "Examen"} · {formatDate(attempt.startedAt)}
        </p>
        <p className="text-heading">{statusLine(attempt)}</p>
      </header>

      {attempt.status === "abandoned" && <AbandonedDetail attempt={attempt} />}

      {attempt.status === "graded" && AsyncResult.matchWithError(solvable, {
        onInitial: () => <p className="text-muted">Cargando las preguntas…</p>,
        onError: (error) => {
          const notice = describeFailure(error, { area: "assessments", action: "load" }, "AttemptHistory");
          return <p className="text-danger-ink">{notice.title} {notice.description}</p>;
        },
        onDefect: () => <p className="text-danger-ink">{DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => <GradedDetail attempt={attempt} assessment={value} onOpenCitation={onOpenCitation} />
      })}
    </article>
  );
}

function GradedDetail({
  attempt,
  assessment,
  onOpenCitation
}: {
  readonly attempt: GradedAttempt;
  readonly assessment: SolvableAssessment;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}) {
  const dispute = useAtomSet(disputeAction, { mode: "promise" });
  const answers: LocalAnswers = answersFromStored(attempt.answers);

  return (
    <>
      <div className="grid gap-4">
        {assessment.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            index={index}
            question={question}
            answers={answers}
            setAnswers={noopSetAnswers}
            locked
            correction={attempt.corrections.find((item) => item.questionId === question.id)}
            onDispute={() => void dispute({ attemptId: attempt.id, questionId: question.id }).catch(() => {})}
            onOpenCitation={onOpenCitation}
          />
        ))}
      </div>
      <AttemptSummary attempt={attempt} />
    </>
  );
}

function AbandonedDetail({ attempt }: { readonly attempt: AbandonedAttempt }) {
  return (
    <div className="grid gap-4">
      <p className=" border border-border bg-surface p-4 text-body">
        {attempt.reason === "cancelled"
          ? "Cancelaste este intento antes de entregarlo."
          : "Se agotó el tiempo conectado antes de entregar."}{" "}
        Un intento cerrado sin entregar no se corrige y no mueve tu perfil.
      </p>
      {attempt.interruptions.length > 0 && (
        <div className=" border border-border bg-surface p-4">
          <p className="mb-2 font-semibold text-heading text-sm">
            {interruptionLabel(attempt.interruptions.length)}
          </p>
          <ul className="grid gap-1 text-muted text-sm">
            {attempt.interruptions.map((gap, index) => (
              <li key={index}>
                del {formatTime(gap.from)} al {formatTime(gap.to)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Formato ----------------------------------------------------------------------------------

const noopSetAnswers: React.Dispatch<React.SetStateAction<LocalAnswers>> = () => {};

const round2 = (value: number): number => Math.round(value * 100) / 100;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es");
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = Math.round(total % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function interruptionLabel(count: number): string {
  return count === 1 ? "Interrumpido 1 vez" : `Interrumpido ${count} veces`;
}

import { useAtomValue } from "@effect/atom-react";
import type { TopicStudyProfile } from "@proxus/shared";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { orderTopicsForStudy } from "../../domain/profile/next-study-action.ts";
import { studyProfileQuery } from "../../domain/profile/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { StatusNotice } from "../ui/StatusNotice.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";

interface StudyProfilePanelProps {
  readonly materialId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreateReview: (topicId: string, topicLabel: string) => void;
}

const hasReviewSignal = (topic: TopicStudyProfile): boolean =>
  topic.incorrect > 0 || topic.hintsRevealed > 0 || topic.emphasis;

export function StudyProfilePanel({
  materialId,
  open,
  onClose,
  onCreateReview,
}: StudyProfilePanelProps) {
  const profile = useAtomValue(studyProfileQuery(materialId));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Progreso de este material"
      widthClassName="max-w-[440px]"
      placement="right"
    >
      <div className="flex h-full flex-col">
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-border border-b px-5">
          <div>
            <p className="text-muted text-xs uppercase tracking-widest">Solo lectura</p>
            <h2 className="font-semibold text-heading text-lg">Progreso de este material</h2>
          </div>
          <IconButton icon="close" label="Cerrar progreso" onClick={onClose} />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {AsyncResult.matchWithError(profile, {
            onInitial: () => (
              <p className="text-muted text-sm" aria-live="polite">Cargando tu progreso…</p>
            ),
            onError: (error) => {
              const notice = describeFailure(
                error,
                { area: "profile", action: "load" },
                "StudyProfilePanel",
              );
              return (
                <StatusNotice
                  tone="danger"
                  title={notice.title}
                  {...(notice.description === undefined ? {} : { description: notice.description })}
                />
              );
            },
            onDefect: () => (
              <StatusNotice tone="danger" title="No se pudo cargar el progreso" description={DEFECT_MESSAGE} />
            ),
            onSuccess: ({ value }) => {
              if (value.topics.length === 0) {
                return (
                  <EmptyState
                    title="Todavía no hay señales de estudio"
                    description="Corrige un Control para registrar aciertos, fallos, respuestas sin evaluar y en blanco. Abrir pistas o marcar apuntes como importantes añade esas señales por separado."
                  />
                );
              }

              const ordered = orderTopicsForStudy(value.topics);
              const reviewTarget = ordered.find(hasReviewSignal);
              const totals = sumSignals(value.topics);
              return (
                <>
                  <p className="text-muted text-sm leading-relaxed">
                    Cada señal conserva su significado. No se combinan en una nota ni en un porcentaje de dominio.
                  </p>
                  <SignalSummary totals={totals} />

                  {reviewTarget !== undefined && (
                    <ActionButton
                      icon="refresh"
                      variant="primary"
                      className="mt-4"
                      onClick={() => {
                        onCreateReview(reviewTarget.topicId, reviewTarget.topicLabel);
                        onClose();
                      }}
                    >
                      Crear prueba de repaso
                    </ActionButton>
                  )}

                  <h3 className="mt-6 font-semibold text-heading">Temas</h3>
                  <ul className="mt-2 grid gap-3">
                    {ordered.map((topic) => <TopicRow key={topic.topicId} topic={topic} />)}
                  </ul>

                  <p className="mt-5 text-muted text-xs">
                    {value.updatedAt === null
                      ? "Todavía no hay correcciones registradas."
                      : `Actualizado el ${new Date(value.updatedAt).toLocaleString("es")}.`}
                  </p>
                </>
              );
            },
          })}
        </div>
      </div>
    </Dialog>
  );
}

interface SignalTotals {
  readonly correct: number;
  readonly incorrect: number;
  readonly unevaluated: number;
  readonly blank: number;
  readonly hintsRevealed: number;
  readonly emphasis: number;
}

const sumSignals = (topics: readonly TopicStudyProfile[]): SignalTotals =>
  topics.reduce<SignalTotals>(
    (totals, topic) => ({
      correct: totals.correct + topic.correct,
      incorrect: totals.incorrect + topic.incorrect,
      unevaluated: totals.unevaluated + topic.unevaluated,
      blank: totals.blank + topic.blank,
      hintsRevealed: totals.hintsRevealed + topic.hintsRevealed,
      emphasis: totals.emphasis + (topic.emphasis ? 1 : 0),
    }),
    { correct: 0, incorrect: 0, unevaluated: 0, blank: 0, hintsRevealed: 0, emphasis: 0 },
  );

function SignalSummary({ totals }: { readonly totals: SignalTotals }) {
  return (
    <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
      <SummaryCell label="Aciertos" value={totals.correct} />
      <SummaryCell label="Fallos" value={totals.incorrect} />
      <SummaryCell label="Sin evaluar" value={totals.unevaluated} />
      <SummaryCell label="En blanco" value={totals.blank} />
      <SummaryCell label="Pistas" value={totals.hintsRevealed} />
      <SummaryCell label="Énfasis" value={totals.emphasis} />
    </dl>
  );
}

function SummaryCell({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="bg-surface p-3">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 font-semibold text-heading text-lg">{value}</dd>
    </div>
  );
}

function TopicRow({ topic }: { readonly topic: TopicStudyProfile }) {
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-heading text-sm">{topic.topicLabel}</p>
        {topic.emphasis && (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-heading text-xs">Marcado</span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
        <TopicSignal label="Aciertos" value={topic.correct} />
        <TopicSignal label="Fallos" value={topic.incorrect} />
        <TopicSignal label="Sin evaluar" value={topic.unevaluated} />
        <TopicSignal label="En blanco" value={topic.blank} />
        <TopicSignal label="Pistas" value={topic.hintsRevealed} />
        <TopicSignal label="Énfasis" value={topic.emphasis ? 1 : 0} />
      </dl>
    </li>
  );
}

function TopicSignal({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt className="text-muted text-[11px]">{label}</dt>
      <dd className="font-semibold text-body text-sm">{value}</dd>
    </div>
  );
}

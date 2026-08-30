import { useAtomValue } from "@effect/atom-react";
import type { TopicStudyProfile } from "@proxus/shared";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { studyProfileQuery } from "../../domain/profile/atoms.ts";
import { DEFECT_MESSAGE, messageOf } from "../../lib/error-message.ts";

// Vista del perfil de estudio de un material (paso 28 del plan). Solo lectura: lo escribe el código al
// corregir un intento, nunca el modelo, y no hay ninguna ruta que lo escriba (F3-31, invariante 4).
// Las tres señales van SEPARADAS (invariante 5, F3-29): dificultad observada (aciertos / fallos / sin
// evaluar / en blanco), pistas abiertas y marca de énfasis. No se muestra ningún número que sea suma
// de dos de ellas.

// Un tema "tiene señal" si el repaso lo tendría en cuenta: lo falló, abrió una pista o lo marcó.
const hasReviewSignal = (topic: TopicStudyProfile): boolean =>
  topic.incorrect > 0 || topic.hintsRevealed > 0 || topic.emphasis;

export function StudyProfilePanel({ materialId }: { readonly materialId: string }) {
  const profile = useAtomValue(studyProfileQuery(materialId));

  return (
    <details className="group mb-4 rounded-2xl border border-border bg-surface/50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold text-heading text-sm marker:content-none">
        Tu progreso en este material
        <svg
          className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path d="m5 7 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="border-border border-t px-4 py-4">
        {AsyncResult.matchWithError(profile, {
          onInitial: () => <p className="text-muted text-sm">Cargando tu progreso…</p>,
          onError: (error) => (
            <p className="text-danger-ink text-sm">No se pudo cargar tu progreso: {messageOf(error)}</p>
          ),
          onDefect: () => (
            <p className="text-danger-ink text-sm">No se pudo cargar tu progreso: {DEFECT_MESSAGE}</p>
          ),
          onSuccess: ({ value }) => {
            if (value.topics.length === 0) {
              return (
                <p className="text-muted text-sm">
                  Todavía no hay señales. Cuando corrijas una prueba de este material, aquí verás tema a
                  tema lo que llevas peor: lo que fallaste, lo que consultaste con pista y lo que
                  marcaste como importante.
                </p>
              );
            }
            return (
              <>
                <p className="mb-3 text-muted text-xs">
                  Tres señales por separado. El repaso concentra las preguntas en los temas con fallos,
                  pistas abiertas o marca de énfasis.
                </p>
                <ul className="grid gap-2">
                  {value.topics.map((topic) => (
                    <TopicRow key={topic.topicId} topic={topic} />
                  ))}
                </ul>
                {value.updatedAt !== null && (
                  <p className="mt-3 text-muted text-xs">
                    Actualizado el {new Date(value.updatedAt).toLocaleString("es")}.
                  </p>
                )}
              </>
            );
          }
        })}
      </div>
    </details>
  );
}

function TopicRow({ topic }: { readonly topic: TopicStudyProfile }) {
  const dim = !hasReviewSignal(topic) && topic.correct === 0;

  return (
    <li
      className={`rounded-xl border border-border bg-canvas p-3 ${dim ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-heading text-sm">{topic.topicLabel}</p>
        {topic.emphasis && (
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-heading text-xs">
            Marcado como importante
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <Signal label="Aciertos" value={topic.correct} tone="success" />
        <Signal label="Fallos" value={topic.incorrect} tone="danger" />
        {topic.unevaluated > 0 && <Signal label="Sin evaluar" value={topic.unevaluated} tone="warning" />}
        {topic.blank > 0 && <Signal label="En blanco" value={topic.blank} tone="muted" />}
        {topic.hintsRevealed > 0 && (
          <Signal label={topic.hintsRevealed === 1 ? "Pista abierta" : "Pistas abiertas"} value={topic.hintsRevealed} tone="brand" />
        )}
      </div>
    </li>
  );
}

const toneClass: Record<"success" | "danger" | "warning" | "brand" | "muted", string> = {
  success: "bg-success/20 text-success-ink",
  danger: "bg-danger/20 text-danger-ink",
  warning: "bg-warning/20 text-warning-ink",
  brand: "bg-brand-soft text-heading",
  muted: "bg-border text-muted"
};

function Signal({
  label,
  value,
  tone
}: {
  readonly label: string;
  readonly value: number;
  readonly tone: "success" | "danger" | "warning" | "brand" | "muted";
}) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 font-semibold ${toneClass[tone]}`}>
      {label}: {value}
    </span>
  );
}

import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { LIMITS, type AssessmentListEntry, type GenerateAssessmentInput, type StudyProfile } from "@proxus/shared";
import { useEffect, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialAssessmentsQuery } from "../../domain/assessments/atoms.ts";
import { studyProfileQuery } from "../../domain/profile/atoms.ts";
import { streamGenerateAssessment } from "../../domain/assessments/generation-stream.ts";
import { AssessmentSolver } from "./AssessmentSolver.tsx";
import { AttemptHistory } from "./AttemptHistory.tsx";
import { DEFECT_MESSAGE, messageOf } from "../../lib/error-message.ts";

// Petición de "Control de este tema" que llega desde el mapa mental (§6.11). MaterialPanel la sube
// como prop; la pestaña la convierte en la tarjeta de generación con su selector de preguntas.
export interface PendingControl {
  readonly topicId: string;
  readonly topicLabel: string;
}

type View =
  | { readonly kind: "list" }
  | { readonly kind: "solve"; readonly id: string; readonly title: string }
  | { readonly kind: "history"; readonly id: string; readonly title: string };

type GenTarget =
  | { readonly kind: "test" }
  | { readonly kind: "quiz"; readonly topicId: string; readonly topicLabel: string };

// Cómo se resuelve una prueba, a partir de su tipo y su modo. Un Control y un Examen de prueba se
// resuelven en el mismo sitio (a libro abierto); un Examen real toma la aplicación entera.
function rowKindLabel(entry: AssessmentListEntry): string {
  if (entry.kind === "quiz") {
    return "Control";
  }
  return entry.mode === "exam" ? "Examen real" : "Examen de prueba";
}

export function AssessmentsTab({
  materialId,
  pendingControl,
  onPendingControlConsumed,
  onStartExam
}: {
  readonly materialId: string;
  readonly pendingControl: PendingControl | null;
  readonly onPendingControlConsumed: () => void;
  readonly onStartExam: (artifactId: string, title: string) => void;
}) {
  const assessments = useAtomValue(materialAssessmentsQuery(materialId));
  const refresh = useAtomRefresh(materialAssessmentsQuery(materialId));
  const [view, setView] = useState<View>({ kind: "list" });
  const [genTarget, setGenTarget] = useState<GenTarget | null>(null);

  useEffect(() => {
    if (pendingControl !== null) {
      setGenTarget({ kind: "quiz", topicId: pendingControl.topicId, topicLabel: pendingControl.topicLabel });
      setView({ kind: "list" });
      onPendingControlConsumed();
    }
  }, [pendingControl, onPendingControlConsumed]);

  if (view.kind === "solve") {
    return (
      <AssessmentSolver
        artifactId={view.id}
        title={view.title}
        onExit={() => setView({ kind: "list" })}
      />
    );
  }

  if (view.kind === "history") {
    return (
      <AttemptHistory
        artifactId={view.id}
        title={view.title}
        onExit={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">Controles (un tema) y Exámenes (el material entero).</p>
        <button
          type="button"
          className="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand text-sm hover:bg-brand/90 disabled:opacity-50"
          onClick={() => setGenTarget({ kind: "test" })}
          disabled={genTarget !== null}
        >
          Examen del material
        </button>
      </div>

      {genTarget !== null && (
        <GenerateCard
          materialId={materialId}
          target={genTarget}
          onClose={() => setGenTarget(null)}
          onGenerated={() => {
            refresh();
            setGenTarget(null);
          }}
        />
      )}

      {AsyncResult.matchWithError(assessments, {
        onInitial: () => <p className="text-muted">Cargando las pruebas…</p>,
        onError: (error) => <p className="text-danger-ink">No se pudieron cargar las pruebas: {messageOf(error)}</p>,
        onDefect: (defect) => <p className="text-danger-ink">No se pudieron cargar las pruebas: {DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => value.assessments.length === 0
          ? (
              <p className="rounded-2xl border border-dashed border-border bg-surface/40 p-6 text-center text-muted">
                Este material no tiene ninguna prueba todavía. Genera un Examen aquí arriba, o un Control
                desde un tema del mapa mental.
              </p>
            )
          : (
              <ul className="grid gap-3">
                {value.assessments.map((entry) => (
                  <AssessmentRow
                    key={entry.id}
                    entry={entry}
                    onOpen={() => setView({ kind: "solve", id: entry.id, title: entry.title })}
                    onStartExam={() => onStartExam(entry.id, entry.title)}
                    onHistory={() => setView({ kind: "history", id: entry.id, title: entry.title })}
                  />
                ))}
              </ul>
            )
      })}
    </div>
  );
}

function AssessmentRow({
  entry,
  onOpen,
  onStartExam,
  onHistory
}: {
  readonly entry: AssessmentListEntry;
  readonly onOpen: () => void;
  readonly onStartExam: () => void;
  readonly onHistory: () => void;
}) {
  const isRealExam = entry.kind === "test" && entry.mode === "exam";

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 text-muted text-xs uppercase tracking-widest">
            {rowKindLabel(entry)}
            {entry.origin === "review" && " · de repaso"}
          </p>
          <h3 className="font-semibold text-heading">{entry.title}</h3>
          <p className="mt-1 text-muted text-sm">
            {entry.scope.topicLabel} · {entry.questionCount} {entry.questionCount === 1 ? "pregunta" : "preguntas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {entry.lastAttempt !== null && (
            <button
              type="button"
              className="rounded-full border border-border-strong px-4 py-1.5 text-body text-sm hover:border-brand"
              onClick={onHistory}
            >
              Ver intentos
            </button>
          )}
          {isRealExam
            ? (
                <button
                  type="button"
                  className="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand text-sm hover:bg-brand/90"
                  onClick={onStartExam}
                >
                  Empezar el examen
                </button>
              )
            : (
                <button
                  type="button"
                  className="rounded-full border border-border-strong px-4 py-1.5 text-body text-sm hover:border-brand"
                  onClick={onOpen}
                >
                  {entry.kind === "quiz" ? "Practicar" : "Abrir"}
                </button>
              )}
        </div>
      </div>
      <p className="mt-2 text-muted text-sm">
        {entry.lastAttempt === null
          ? "Sin intentos."
          : `Último intento: ${lastAttemptLabel(entry.lastAttempt)}`}
      </p>
    </li>
  );
}

function lastAttemptLabel(last: NonNullable<AssessmentListEntry["lastAttempt"]>): string {
  const mode = last.mode === "practice" ? "práctica" : "examen";
  if (last.status === "in-progress") {
    return `${mode}, en curso`;
  }
  if (last.status === "abandoned") {
    return `${mode}, abandonado`;
  }
  return `${mode}, nota ${last.displayedScore ?? "sin evaluar"} / 10`;
}

// --- Tarjeta de generación ---------------------------------------------------------------------

function GenerateCard({
  materialId,
  target,
  onClose,
  onGenerated
}: {
  readonly materialId: string;
  readonly target: GenTarget;
  readonly onClose: () => void;
  readonly onGenerated: () => void;
}) {
  const range = target.kind === "test" ? LIMITS.questionsPerTest : LIMITS.questionsPerQuiz;
  const [count, setCount] = useState<number>(range.default);
  // El modo solo se elige para el Examen; el Control es siempre de práctica.
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  // De dónde salen las preguntas: "material" (nuevas) o "review" (concentradas en lo que llevas peor
  // de este alcance). El repaso solo se ofrece si el perfil tiene algo que repasar (F3-32).
  const [origin, setOrigin] = useState<"material" | "review">("material");
  const profile = AsyncResult.getOrElse(
    useAtomValue(studyProfileQuery(materialId)),
    () => ({ materialId, topics: [], updatedAt: null }) as StudyProfile
  );
  const canReview = profile.topics.some(
    (topic) => topic.incorrect > 0 || topic.hintsRevealed > 0 || topic.emphasis
  );
  const effectiveOrigin: "material" | "review" = canReview ? origin : "material";
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [done, setDone] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(undefined);
    setLines([]);
    setDone(false);
    const input: GenerateAssessmentInput = target.kind === "test"
      ? { kind: "test", topicId: null, origin: effectiveOrigin, questionCount: count, mode }
      : { kind: "quiz", topicId: target.topicId, origin: effectiveOrigin, questionCount: count, mode: "practice" };
    try {
      for await (const event of streamGenerateAssessment(materialId, input)) {
        if (event.type === "progress") {
          setLines((current) => [...current, event.message]);
        } else if (event.type === "failed") {
          setError(event.message);
        } else {
          setLines((current) => [
            ...current,
            `Prueba lista: ${event.questionCount} ${event.questionCount === 1 ? "pregunta" : "preguntas"}` +
              (event.retries > 0 ? ` (${event.retries} ${event.retries === 1 ? "reintento" : "reintentos"})` : "")
          ]);
          setDone(true);
        }
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-heading">
            {target.kind === "test" ? "Examen del material" : `Control · ${target.topicLabel}`}
          </h3>
          <p className="text-muted text-sm">
            {target.kind === "test"
              ? "Cubre el material entero, con respuesta múltiple además del resto de tipos."
              : "Cubre solo este tema."}
          </p>
        </div>
        {!running && !done && (
          <button
            type="button"
            className="rounded-full border border-border-strong px-3 py-1.5 text-body text-sm hover:border-brand"
            onClick={onClose}
          >
            Cancelar
          </button>
        )}
      </div>

      {!running && !done && (
        <div className="mt-3 grid gap-3">
          <div className="text-sm">
            <span className="block text-muted">Preguntas</span>
            {canReview
              ? (
                  <>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <ModeChip active={origin === "material"} onClick={() => setOrigin("material")}>
                        Nuevas
                      </ModeChip>
                      <ModeChip active={origin === "review"} onClick={() => setOrigin("review")}>
                        De repaso
                      </ModeChip>
                    </div>
                    <p className="mt-1 text-muted text-xs">
                      {origin === "review"
                        ? "Vuelve sobre lo que llevas peor de este alcance: lo que fallaste, lo que consultaste con pista y lo que marcaste."
                        : "Preguntas nuevas sobre todo el alcance."}
                    </p>
                  </>
                )
              : (
                  <p className="mt-1 text-muted text-xs">
                    El repaso se activa cuando el perfil de este material tenga algo que repasar: un
                    tema fallado, uno consultado con pista o uno marcado como importante.
                  </p>
                )}
          </div>
          {target.kind === "test" && (
            <div className="text-sm">
              <span className="block text-muted">Modo</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <ModeChip active={mode === "practice"} onClick={() => setMode("practice")}>
                  De prueba
                </ModeChip>
                <ModeChip active={mode === "exam"} onClick={() => setMode("exam")}>
                  Real
                </ModeChip>
              </div>
              <p className="mt-1 text-muted text-xs">
                {mode === "practice"
                  ? "A libro abierto: pistas, material a la vista y el tutor. Corrige al entregar."
                  : "A puerta cerrada: reloj, penalización y sin pistas. El resto de la aplicación se bloquea mientras dure."}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="block text-muted">Número de preguntas ({range.min} a {range.max})</span>
              <input
                type="number"
                min={range.min}
                max={range.max}
                value={count}
                onChange={(event) => setCount(clamp(Number(event.currentTarget.value), range.min, range.max))}
                className="mt-1 w-24 rounded-xl border border-border-strong bg-canvas p-2 text-heading outline-none focus:border-brand"
              />
            </label>
            <button
              type="button"
              className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90"
              onClick={() => void run()}
            >
              Generar
            </button>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-border bg-canvas p-3 text-muted text-sm">
          {lines.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      )}
      {error !== undefined && <p className="mt-3 text-danger-ink">La generación falló: {error}</p>}
      {running && <p className="mt-3 text-muted text-sm">Generando…</p>}
      {done && (
        <button
          type="button"
          className="mt-3 rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90"
          onClick={onGenerated}
        >
          Ver la prueba en la lista
        </button>
      )}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-4 py-1.5 text-sm ${
        active ? "border border-brand bg-brand-soft text-heading" : "border border-border text-muted hover:text-heading"
      }`}
    >
      {children}
    </button>
  );
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isNaN(value) ? min : Math.min(Math.max(Math.round(value), min), max);

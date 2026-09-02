import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { LIMITS, type AssessmentListEntry, type GenerateAssessmentInput, type StudyProfile } from "@proxus/shared";
import { useEffect, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialAssessmentsQuery } from "../../domain/assessments/atoms.ts";
import { deleteArtifactAction } from "../../domain/artifacts/atoms.ts";
import { studyProfileQuery } from "../../domain/profile/atoms.ts";
import { streamGenerateAssessment } from "../../domain/assessments/generation-stream.ts";
import { groupAssessments } from "../../domain/assessments/group-assessments.ts";
import {
  ASSESSMENT_STARTING_LINE,
  assessmentProgressLine,
  type ProgressLine
} from "../../domain/progress/progress-line.ts";
import { AssessmentGroupTabs, type AssessmentGroup } from "./AssessmentGroupTabs.tsx";
import { AssessmentList } from "./AssessmentList.tsx";
import { AssessmentSolver } from "./AssessmentSolver.tsx";
import { AttemptHistory } from "./AttemptHistory.tsx";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";
import { ActionButton } from "../ui/ActionButton.tsx";
import { GenerationProgress } from "../ui/GenerationProgress.tsx";
import type { IconName } from "../ui/Icon.tsx";

// Petición de "Control de este tema" que llega desde el mapa mental (§6.11). MaterialPanel la sube
// como prop; la pestaña la convierte en la tarjeta de generación con su selector de preguntas.
export interface PendingControl {
  readonly topicId: string;
  readonly topicLabel: string;
  readonly origin?: "material" | "review";
}

type View =
  | { readonly kind: "list" }
  | { readonly kind: "solve"; readonly id: string; readonly title: string }
  | { readonly kind: "history"; readonly id: string; readonly title: string };

type GenTarget =
  | { readonly kind: "test" }
  | {
      readonly kind: "quiz";
      readonly topicId: string;
      readonly topicLabel: string;
      readonly initialOrigin: "material" | "review";
    };

const EMPTY_MESSAGE: Record<AssessmentGroup, string> = {
  controls: "Todavía no hay ningún Control. Genera uno desde un tema del mapa mental.",
  practiceExams: "Todavía no hay ningún Examen de prueba. Genera uno con el botón de arriba.",
  realExams: "Todavía no hay ningún Examen real. Genera uno de prueba y elige el modo «Real»."
};

export function AssessmentsTab({
  materialId,
  pendingControl,
  onPendingControlConsumed,
  onStartExam,
  onActiveArtifactChange,
  onOpenCitation
}: {
  readonly materialId: string;
  readonly pendingControl: PendingControl | null;
  readonly onPendingControlConsumed: () => void;
  readonly onStartExam: (artifactId: string, title: string) => void;
  // Contexto de pantalla (fase 4, decisión 5): la prueba abierta en detalle, para el chip del tutor.
  // `undefined` mientras se está en la lista, sin ninguna prueba concreta abierta.
  readonly onActiveArtifactChange?: (artifact: { readonly id: string; readonly title: string } | undefined) => void;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}) {
  const assessments = useAtomValue(materialAssessmentsQuery(materialId));
  const refresh = useAtomRefresh(materialAssessmentsQuery(materialId));
  const [view, setView] = useState<View>({ kind: "list" });
  const [genTarget, setGenTarget] = useState<GenTarget | null>(null);
  const [activeGroup, setActiveGroup] = useState<AssessmentGroup>("controls");
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const deleteArtifact = useAtomSet(deleteArtifactAction, { mode: "promise" });

  const onDelete = async (entry: AssessmentListEntry) => {
    if (!window.confirm(`¿Borrar "${entry.title}"? Se pierden también sus intentos guardados.`)) {
      return;
    }
    setDeleteError(undefined);
    try {
      await deleteArtifact(entry.id);
      refresh();
    } catch (cause) {
      const notice = describeFailure(cause, { area: "assessments", action: "delete" }, "AssessmentsTab");
      setDeleteError(notice.description ?? notice.title);
    }
  };

  useEffect(() => {
    if (pendingControl !== null) {
      setGenTarget({
        kind: "quiz",
        topicId: pendingControl.topicId,
        topicLabel: pendingControl.topicLabel,
        initialOrigin: pendingControl.origin ?? "material",
      });
      setView({ kind: "list" });
      onPendingControlConsumed();
    }
  }, [pendingControl, onPendingControlConsumed]);

  useEffect(() => {
    onActiveArtifactChange?.(view.kind === "list" ? undefined : { id: view.id, title: view.title });
  }, [view, onActiveArtifactChange]);

  if (view.kind === "solve") {
    return (
      <AssessmentSolver
        artifactId={view.id}
        title={view.title}
        onExit={() => setView({ kind: "list" })}
        onOpenCitation={onOpenCitation}
      />
    );
  }

  if (view.kind === "history") {
    return (
      <AttemptHistory
        artifactId={view.id}
        title={view.title}
        onExit={() => setView({ kind: "list" })}
        onOpenCitation={onOpenCitation}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {genTarget !== null && (
        <GenerateCard
          materialId={materialId}
          target={genTarget}
          onClose={() => setGenTarget(null)}
          onGenerated={(generated) => {
            // Navegación al terminar (§11.4, F5-47): un Control o un Examen de prueba se abren en su
            // solver; un Examen real abre su pantalla previa con `attemptId: null`, que es el aviso
            // de F3-39d: el intento nace al pulsar "Empezar el examen", no al generarlo.
            refresh();
            setGenTarget(null);
            if (generated.kind === "test" && generated.mode === "exam") {
              setActiveGroup("realExams");
              onStartExam(generated.id, generated.title);
              return;
            }
            setView({ kind: "solve", id: generated.id, title: generated.title });
          }}
        />
      )}

      {AsyncResult.matchWithError(assessments, {
        onInitial: () => <p className="text-muted">Cargando las pruebas…</p>,
        onError: (error) => {
          const notice = describeFailure(error, { area: "assessments", action: "list" }, "AssessmentsTab");
          return <p className="text-danger-ink">{notice.title} {notice.description}</p>;
        },
        onDefect: (defect) => <p className="text-danger-ink">No se pudieron cargar las pruebas: {DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => {
          const grouped = groupAssessments(value.assessments);
          return (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <AssessmentGroupTabs
                  active={activeGroup}
                  onChange={setActiveGroup}
                  counts={{
                    controls: grouped.controls.length,
                    practiceExams: grouped.practiceExams.length,
                    realExams: grouped.realExams.length
                  }}
                />
                <ActionButton
                  icon="plus"
                  variant="brand"
                  size="compact"
                  className="mb-2"
                  onClick={() => setGenTarget({ kind: "test" })}
                  disabled={genTarget !== null}
                >
                  Examen del material
                </ActionButton>
              </div>
              {deleteError !== undefined && (
                <p className="mb-3 border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{deleteError}</p>
              )}
              <AssessmentList
                entries={grouped[activeGroup]}
                emptyMessage={EMPTY_MESSAGE[activeGroup]}
                onOpen={(entry) => setView({ kind: "solve", id: entry.id, title: entry.title })}
                onStartExam={(entry) => onStartExam(entry.id, entry.title)}
                onHistory={(entry) => setView({ kind: "history", id: entry.id, title: entry.title })}
                onDelete={(entry) => void onDelete(entry)}
              />
            </>
          );
        }
      })}
    </div>
  );
}

// --- Tarjeta de generación ---------------------------------------------------------------------

// Lo que hace falta para decidir a dónde se navega al terminar (§11.4): el id y el título salen del
// evento `done`; el tipo y el modo, de lo que se pidió.
export interface GeneratedAssessment {
  readonly id: string;
  readonly title: string;
  readonly kind: "quiz" | "test";
  readonly mode: "practice" | "exam";
}

function GenerateCard({
  materialId,
  target,
  onClose,
  onGenerated
}: {
  readonly materialId: string;
  readonly target: GenTarget;
  readonly onClose: () => void;
  readonly onGenerated: (generated: GeneratedAssessment) => void;
}) {
  const range = target.kind === "test" ? LIMITS.questionsPerTest : LIMITS.questionsPerQuiz;
  const [count, setCount] = useState<number>(range.default);
  // El modo solo se elige para el Examen; el Control es siempre de práctica.
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  // De dónde salen las preguntas: "material" (nuevas) o "review" (concentradas en lo que llevas peor
  // de este alcance). El repaso solo se ofrece si el perfil tiene algo que repasar (F3-32).
  const [origin, setOrigin] = useState<"material" | "review">(
    target.kind === "quiz" ? target.initialOrigin : "material",
  );
  const profile = AsyncResult.getOrElse(
    useAtomValue(studyProfileQuery(materialId)),
    () => ({ materialId, topics: [], updatedAt: null }) as StudyProfile
  );
  const canReview = profile.topics.some(
    (topic) => topic.incorrect > 0 || topic.hintsRevealed > 0 || topic.emphasis
  );
  const effectiveOrigin: "material" | "review" = canReview ? origin : "material";
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressLine | null>(null);
  const [error, setError] = useState<string | undefined>();

  const run = async () => {
    setRunning(true);
    setError(undefined);
    setProgress(ASSESSMENT_STARTING_LINE);
    const requestedMode = target.kind === "test" ? mode : "practice";
    const input: GenerateAssessmentInput = target.kind === "test"
      ? { kind: "test", topicId: null, origin: effectiveOrigin, questionCount: count, mode }
      : { kind: "quiz", topicId: target.topicId, origin: effectiveOrigin, questionCount: count, mode: "practice" };
    try {
      for await (const event of streamGenerateAssessment(materialId, input)) {
        if (event.type === "progress") {
          setProgress(assessmentProgressLine(event));
        } else if (event.type === "failed") {
          // Una generación fallida no navega a ninguna parte (F5-47): se queda la tarjeta con su
          // error y su "Cancelar", y la línea viva desaparece (F5-46).
          setProgress(null);
          setError(event.message);
          return;
        } else {
          setProgress({
            phrase: `Prueba lista: ${event.questionCount} ${event.questionCount === 1 ? "pregunta" : "preguntas"}.`,
            step: null,
            total: null
          });
          // El tipo y el modo que deciden a dónde se navega son los que se PIDIERON: `ArtifactSummary`
          // no lleva `mode` y no se amplía el contrato por un efecto de interfaz (decisión 32).
          onGenerated({
            id: event.assessment.id,
            title: event.assessment.title,
            kind: target.kind,
            mode: requestedMode
          });
        }
      }
    } catch (cause) {
      const notice = describeFailure(cause, { area: "assessments", action: "generate" }, "AssessmentsTab");
      setProgress(null);
      setError(notice.description ?? notice.title);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-4 border border-dashed border-border bg-surface/50 p-4">
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
        {!running && (
          <ActionButton
            icon="close"
            variant="neutral"
            size="compact"
            onClick={onClose}
          >
            Cancelar
          </ActionButton>
        )}
      </div>

      {!running && (
        <div className="mt-3 grid gap-3">
          <div className="text-sm">
            <span className="block text-muted">Preguntas</span>
            {canReview
              ? (
                  <>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <ModeChip icon="sparkles" active={origin === "material"} onClick={() => setOrigin("material")}>
                        Nuevas
                      </ModeChip>
                      <ModeChip icon="refresh" active={origin === "review"} onClick={() => setOrigin("review")}>
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
                <ModeChip icon="book-open" active={mode === "practice"} onClick={() => setMode("practice")}>
                  De prueba
                </ModeChip>
                <ModeChip icon="lock" active={mode === "exam"} onClick={() => setMode("exam")}>
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
                className="mt-1 w-24 border border-border-strong bg-canvas p-2 text-heading outline-none focus:border-brand"
              />
            </label>
            <ActionButton
              icon="sparkles"
              variant="primary"
              onClick={() => void run()}
            >
              Generar
            </ActionButton>
          </div>
        </div>
      )}

      {progress !== null && <GenerationProgress line={progress} className="mt-3" />}
      {error !== undefined && <p className="mt-3 text-danger-ink">La generación falló: {error}</p>}
    </div>
  );
}

function ModeChip({
  icon,
  active,
  onClick,
  children
}: {
  readonly icon: IconName;
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}) {
  return (
    <ActionButton
      icon={icon}
      onClick={onClick}
      aria-pressed={active}
      variant={active ? "selected" : "neutral"}
      size="compact"
    >
      {children}
    </ActionButton>
  );
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isNaN(value) ? min : Math.min(Math.max(Math.round(value), min), max);

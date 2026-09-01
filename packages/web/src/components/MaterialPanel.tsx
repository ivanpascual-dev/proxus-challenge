import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ChatContextRef } from "@proxus/shared";
import { useEffect, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import {
  artifactQuery,
  artifactsQuery,
  deleteArtifactAction,
} from "../domain/artifacts/atoms.ts";
import {
  materialIndexQuery,
  materialsQuery,
} from "../domain/materials/atoms.ts";
import { streamGenerateNotes } from "../domain/artifacts/note-generation-stream.ts";
import {
  AssessmentsTab,
  type PendingControl,
} from "./assessment/AssessmentsTab.tsx";
import { NoteWorkspace } from "./note/NoteWorkspace.tsx";
import { streamReindexMaterial } from "../domain/materials/stream.ts";
import {
  nextStudyAction,
  type NextStudyAction as StudyAction,
} from "../domain/profile/next-study-action.ts";
import { studyProfileQuery } from "../domain/profile/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../lib/user-feedback.ts";
import { NextStudyAction } from "./assessment/NextStudyAction.tsx";
import { StudyProfilePanel } from "./assessment/StudyProfilePanel.tsx";
import { MaterialHeader } from "./material/MaterialHeader.tsx";
import { MaterialTabs, type Tab } from "./material/MaterialTabs.tsx";
import { MindMapWorkspace } from "./material/mindmap/MindMapWorkspace.tsx";
import { PdfWorkspace } from "./material/pdf/PdfWorkspace.tsx";
import type { PageMarker } from "./material/pdf/PdfPage.tsx";
import { ActionButton } from "./ui/ActionButton.tsx";

interface MaterialPanelProps {
  readonly materialId: string;
  readonly indexState: "indexed" | "not-indexed";
  readonly title: string;
  readonly pageCount: number;
  // Cierre explícito del material (decisión 10): vuelve a Sym a ancho completo.
  readonly onClose: () => void;
  // Empezar un Examen real saca de aquí: la aplicación entera pasa a ser el panel del examen
  // (decisión 18).
  readonly onStartExam: (artifactId: string, title: string) => void;
  // Contexto de pantalla (fase 4, decisión 5): el material siempre, más el artefacto de la pestaña
  // activa cuando lo hay (la nota en "Apuntes", la prueba abierta en "Pruebas"). `ChatContextBar` lo
  // muestra antes de enviar y el alumno lo puede quitar.
  readonly onContextChange: (refs: readonly ChatContextRef[]) => void;
  // Cita común (decisión 26, §4.10): abre el material correcto, cambia a PDF y navega a la página.
  readonly onOpenCitation: (materialId: string, page: number) => void;
  readonly citationTarget: {
    readonly materialId: string;
    readonly page: number;
  } | null;
  readonly onCitationConsumed: () => void;
}

type NoteAvailability =
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "ready"; readonly hasNote: boolean };

export function MaterialPanel({
  materialId,
  indexState,
  title,
  pageCount,
  onClose,
  onStartExam,
  onContextChange,
  onOpenCitation,
  citationTarget,
  onCitationConsumed,
}: MaterialPanelProps) {
  const indexed = indexState === "indexed";
  const [tab, setTab] = useState<Tab>("pdf");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [pendingControl, setPendingControl] = useState<PendingControl | null>(
    null,
  );
  const [pendingNoteTopicPages, setPendingNoteTopicPages] = useState<
    readonly number[] | null
  >(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [activeAssessmentArtifact, setActiveAssessmentArtifact] = useState<
    { readonly id: string; readonly title: string } | undefined
  >();
  const artifacts = useAtomValue(artifactsQuery);
  const noteArtifact = AsyncResult.getOrElse(artifacts, () => ({
    artifacts: [] as const,
    unreadable: [] as const,
  })).artifacts.find(
    (artifact) =>
      artifact.kind === "note" && artifact.materialId === materialId,
  );
  const noteAvailability: NoteAvailability = AsyncResult.matchWithError(artifacts, {
    onInitial: () => ({ kind: "loading" }),
    onError: () => ({ kind: "error" }),
    onDefect: () => ({ kind: "error" }),
    onSuccess: ({ value }) => ({
      kind: "ready",
      hasNote: value.artifacts.some(
        (artifact) => artifact.kind === "note" && artifact.materialId === materialId,
      ),
    }),
  });

  useEffect(() => {
    const refs: ChatContextRef[] = [{ type: "material", materialId, title }];
    if (tab === "notes" && noteArtifact !== undefined) {
      refs.push({
        type: "artifact",
        artifactId: noteArtifact.id,
        title: noteArtifact.title,
      });
    }
    if (tab === "assessments" && activeAssessmentArtifact !== undefined) {
      refs.push({
        type: "artifact",
        artifactId: activeAssessmentArtifact.id,
        title: activeAssessmentArtifact.title,
      });
    }
    onContextChange(refs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    materialId,
    title,
    tab,
    noteArtifact?.id,
    noteArtifact?.title,
    activeAssessmentArtifact,
  ]);

  // Al salir del panel del material (otro material, o ninguno), el contexto que proponía deja de
  // aplicar: nada de lo que ya no está en pantalla debe seguir viajando al tutor.
  useEffect(() => () => onContextChange([]), [onContextChange]);

  // Una cita se consume solo cuando apunta a ESTE material: si apunta a otro, `App` ya cambió la
  // selección y el `MaterialPanel` que se monta para ese otro material es el que la recoge.
  useEffect(() => {
    if (citationTarget !== null && citationTarget.materialId === materialId) {
      setTab("pdf");
      setPendingPage(citationTarget.page);
      onCitationConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationTarget, materialId]);

  const generateControlForTopic = (topicId: string, topicLabel: string) => {
    setPendingControl({ topicId, topicLabel, origin: "material" });
    setTab("assessments");
  };

  const activateStudyAction = (action: StudyAction) => {
    switch (action.kind) {
      case "finish-setup":
        if (action.target === "notes") {
          setTab("notes");
        } else {
          requestAnimationFrame(() => document.getElementById("index-material-action")?.focus());
        }
        return;
      case "first-control":
        setPendingControl({
          topicId: action.topicId,
          topicLabel: action.topicLabel,
          origin: "material",
        });
        setTab("assessments");
        return;
      case "review":
        setPendingControl({
          topicId: action.topicId,
          topicLabel: action.topicLabel,
          origin: "review",
        });
        setTab("assessments");
        return;
      case "new-practice":
        setTab("assessments");
        return;
      case "no-data":
        return;
    }
  };

  // Tema -> apunte (decisión 18, §4.1): el mapa manda las páginas del tema, `NoteWorkspace` resuelve
  // el bloque con mayor solape mediante `findBlockForTopic` y, si no hay ninguno, lo dice.
  const goToNoteBlockForTopic = (topicPages: readonly number[]) => {
    setPendingNoteTopicPages(topicPages);
    setTab("notes");
  };

  return (
    <main className="flex h-screen min-w-0 flex-col overflow-hidden bg-canvas/60">
      <MaterialHeader
        title={title}
        pageCount={pageCount}
        indexed={indexed}
        onClose={onClose}
        nextStudyAction={indexed
          ? (
              <IndexedNextStudyAction
                materialId={materialId}
                noteAvailability={noteAvailability}
                onActivate={activateStudyAction}
              />
            )
          : (
              <NextStudyAction
                state={{
                  kind: "ready",
                  action: { kind: "finish-setup", target: "index" },
                }}
                onActivate={activateStudyAction}
              />
            )}
        onOpenProgress={() => setProgressOpen(true)}
      />

      <StudyProfilePanel
        materialId={materialId}
        open={progressOpen}
        onClose={() => setProgressOpen(false)}
        onCreateReview={(topicId, topicLabel) => {
          setPendingControl({ topicId, topicLabel, origin: "review" });
          setTab("assessments");
        }}
      />

      {!indexed && (
        <div className="p-4">
          <ReindexBanner materialId={materialId} />
        </div>
      )}

      {indexed && <MaterialTabs active={tab} onChange={setTab} />}

      <div
        className={`min-h-0 flex-1 p-4 ${tab === "pdf" ? "flex flex-col" : "hidden"}`}
      >
        {indexed ? (
          <IndexedPdfWorkspace
            materialId={materialId}
            pageCount={pageCount}
            scrollTo={pendingPage}
            onScrolled={() => setPendingPage(null)}
          />
        ) : (
          <PdfWorkspace
            materialId={materialId}
            pageCount={pageCount}
            markerFor={() => null}
            scrollToPage={pendingPage}
            onScrolledToPage={() => setPendingPage(null)}
          />
        )}
      </div>

      {indexed && (
        <div
          className={`min-h-0 flex-1 p-4 ${tab === "mindmap" ? "flex flex-col" : "hidden"}`}
        >
          <MindMapWorkspace
            materialId={materialId}
            title={title}
            onGenerateControl={generateControlForTopic}
            onGoToNotes={goToNoteBlockForTopic}
          />
        </div>
      )}

      {indexed && (
        <div
          className={`min-h-0 flex-1 px-4 pt-2 pb-4 ${tab === "notes" ? "flex flex-col" : "hidden"}`}
        >
          <NotesTab
            materialId={materialId}
            onOpenCitation={onOpenCitation}
            requestedTopicPages={pendingNoteTopicPages}
            onRequestedTopicPagesConsumed={() => setPendingNoteTopicPages(null)}
          />
        </div>
      )}

      {indexed && (
        <div
          className={`min-h-0 flex-1 p-4 ${tab === "assessments" ? "flex flex-col" : "hidden"}`}
        >
          <AssessmentsTab
            materialId={materialId}
            pendingControl={pendingControl}
            onPendingControlConsumed={() => setPendingControl(null)}
            onStartExam={onStartExam}
            onActiveArtifactChange={setActiveAssessmentArtifact}
            onOpenCitation={onOpenCitation}
          />
        </div>
      )}
    </main>
  );
}

function IndexedNextStudyAction({
  materialId,
  noteAvailability,
  onActivate,
}: {
  readonly materialId: string;
  readonly noteAvailability: NoteAvailability;
  readonly onActivate: (action: StudyAction) => void;
}) {
  const index = useAtomValue(materialIndexQuery(materialId));
  const profile = useAtomValue(studyProfileQuery(materialId));

  if (noteAvailability.kind === "loading") {
    return <NextStudyAction state={{ kind: "loading" }} onActivate={onActivate} />;
  }
  if (noteAvailability.kind === "error") {
    return (
      <NextStudyAction
        state={{
          kind: "ready",
          action: { kind: "no-data", reason: "No se pudieron comprobar los apuntes del material." },
        }}
        onActivate={onActivate}
      />
    );
  }
  const hasNote = noteAvailability.hasNote;

  const state = AsyncResult.matchWithError(index, {
    onInitial: () => ({ kind: "loading" } as const),
    onError: () => ({
      kind: "ready",
      action: { kind: "no-data", reason: "No se pudo cargar el índice del material." } as StudyAction,
    } as const),
    onDefect: () => ({
      kind: "ready",
      action: { kind: "no-data", reason: "No se pudo cargar el índice del material." } as StudyAction,
    } as const),
    onSuccess: ({ value: materialIndex }) => AsyncResult.matchWithError(profile, {
      onInitial: () => ({ kind: "loading" } as const),
      onError: () => ({
        kind: "ready",
        action: { kind: "no-data", reason: "No se pudo cargar el progreso del material." } as StudyAction,
      } as const),
      onDefect: () => ({
        kind: "ready",
        action: { kind: "no-data", reason: "No se pudo cargar el progreso del material." } as StudyAction,
      } as const),
      onSuccess: ({ value: studyProfile }) => ({
        kind: "ready",
        action: nextStudyAction({
          hasIndex: true,
          hasNote,
          topics: materialIndex.topics,
          profile: studyProfile,
        }),
      } as const),
    }),
  });

  return <NextStudyAction state={state} onActivate={onActivate} />;
}

// --- Visor del PDF -----------------------------------------------------------

// El índice solo se pide cuando el material ya está indexado: el mismo reparto que antes de extraer
// `PdfWorkspace` (fase 5, §4.6), para no lanzar una consulta que el servidor no puede responder.
function IndexedPdfWorkspace({
  materialId,
  pageCount,
  scrollTo,
  onScrolled,
}: {
  readonly materialId: string;
  readonly pageCount: number;
  readonly scrollTo: number | null;
  readonly onScrolled: () => void;
}) {
  const index = useAtomValue(materialIndexQuery(materialId));

  const markerFor = (page: number): PageMarker =>
    AsyncResult.matchWithError(index, {
      onInitial: (): PageMarker => null,
      onError: (): PageMarker => null,
      onDefect: (): PageMarker => null,
      onSuccess: ({ value }): PageMarker => {
        const failed = value.failedPages.find((entry) => entry.page === page);
        if (failed !== undefined) {
          return { kind: "failed", reason: failed.reason };
        }
        const entry = value.pages.find((candidate) => candidate.page === page);
        return entry === undefined ? null : { kind: entry.provenance };
      },
    });

  return (
    <PdfWorkspace
      materialId={materialId}
      pageCount={pageCount}
      markerFor={markerFor}
      scrollToPage={scrollTo}
      onScrolledToPage={onScrolled}
    />
  );
}

// --- Banner de indexación --------------------------------------------------

function ReindexBanner({ materialId }: { readonly materialId: string }) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | undefined>();
  // Al terminar, refrescar la lista basta: el material pasa a "indexed" y el panel muestra las pestañas.
  const refreshMaterials = useAtomRefresh(materialsQuery);

  const run = async () => {
    setRunning(true);
    setError(undefined);
    setLines([]);
    try {
      for await (const event of streamReindexMaterial(materialId)) {
        if (event.type === "progress") {
          setLines((current) => [...current, event.message]);
        } else if (event.type === "failed") {
          setError(event.message);
        } else {
          setLines((current) => [
            ...current,
            `Índice listo: ${event.index.pages.length} páginas, ${event.index.topics.length} temas.`,
          ]);
        }
      }
      refreshMaterials();
    } catch (cause) {
      const notice = describeFailure(
        cause,
        { area: "materials", action: "index" },
        "MaterialPanel",
      );
      setError(notice.description ?? notice.title);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-4 shrink-0 border border-dashed border-border bg-surface/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-heading">Temas sin generar</h3>
          <p className="text-muted text-sm">
            El PDF ya se ve abajo. Indexar detecta los temas y arma el mapa
            mental.
          </p>
        </div>
        <ActionButton
          id="index-material-action"
          icon="sparkles"
          variant="brand"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? "Indexando…" : "Indexar"}
        </ActionButton>
      </div>

      {lines.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-y-auto border border-border bg-canvas p-3 text-muted text-sm">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      {error !== undefined && (
        <p className="mt-3 text-danger-ink">La indexación falló: {error}</p>
      )}
    </div>
  );
}

// --- Pestaña de apuntes ---------------------------------------------------

// El apunte vive dentro del material (fase 2, decisión 18). Si ya existe, se edita aquí; si no, un
// botón lo genera llamando a POST /api/materials/:id/notes, que arma un bloque por tema del índice
// (decisión 23). No pasa por el tutor.
function NotesTab({
  materialId,
  onOpenCitation,
  requestedTopicPages,
  onRequestedTopicPagesConsumed,
}: {
  readonly materialId: string;
  readonly onOpenCitation: (materialId: string, page: number) => void;
  readonly requestedTopicPages: readonly number[] | null;
  readonly onRequestedTopicPagesConsumed: () => void;
}) {
  const artifacts = useAtomValue(artifactsQuery);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {AsyncResult.matchWithError(artifacts, {
        onInitial: () => <p className="text-muted">Cargando los apuntes…</p>,
        onError: (error) => {
          const notice = describeFailure(
            error,
            { area: "notes", action: "load" },
            "MaterialPanel",
          );
          return (
            <p className="text-danger-ink">
              {notice.title} {notice.description}
            </p>
          );
        },
        onDefect: (defect) => (
          <p className="text-danger-ink">{DEFECT_MESSAGE}</p>
        ),
        onSuccess: ({ value }) => {
          const summary = value.artifacts.find(
            (artifact) =>
              artifact.kind === "note" && artifact.materialId === materialId,
          );
          return summary === undefined ? (
            <GenerateNoteCard materialId={materialId} />
          ) : (
            <ExistingNote
              noteId={summary.id}
              onOpenCitation={onOpenCitation}
              requestedTopicPages={requestedTopicPages}
              onRequestedTopicPagesConsumed={onRequestedTopicPagesConsumed}
            />
          );
        },
      })}
    </div>
  );
}

function GenerateNoteCard({ materialId }: { readonly materialId: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const refreshArtifacts = useAtomRefresh(artifactsQuery);

  const run = async () => {
    setRunning(true);
    setError(undefined);
    setProgress(undefined);
    try {
      for await (const event of streamGenerateNotes(materialId)) {
        if (event.type === "progress") {
          setProgress(event.message);
        } else if (event.type === "failed") {
          setError(event.message);
        }
      }
      refreshArtifacts();
    } catch (cause) {
      const notice = describeFailure(
        cause,
        { area: "notes", action: "generate" },
        "MaterialPanel",
      );
      setError(notice.description ?? notice.title);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid place-items-center border border-dashed border-border bg-surface/40 p-10 text-center">
      <div>
        <h3 className="font-bold text-heading text-xl">
          Este material no tiene apuntes todavía.
        </h3>
        <p className="mt-2 max-w-md text-muted">
          Se arma un bloque por cada tema del índice del material, con la prosa
          redactada a partir de sus páginas. Puedes editarlos después.
        </p>
        <ActionButton
          icon="sparkles"
          variant="primary"
          className="mt-4"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? "Creando apuntes…" : "Crear apuntes"}
        </ActionButton>
        {running && (
          <p className="mt-3 text-muted text-sm">
            {progress ?? "Leyendo el índice del material…"}
          </p>
        )}
        {error !== undefined && (
          <p className="mt-3 text-danger-ink">
            No se pudieron crear los apuntes: {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ExistingNote({
  noteId,
  onOpenCitation,
  requestedTopicPages,
  onRequestedTopicPagesConsumed,
}: {
  readonly noteId: string;
  readonly onOpenCitation: (materialId: string, page: number) => void;
  readonly requestedTopicPages: readonly number[] | null;
  readonly onRequestedTopicPagesConsumed: () => void;
}) {
  const note = useAtomValue(artifactQuery(noteId));
  const deleteArtifact = useAtomSet(deleteArtifactAction, { mode: "promise" });
  const refreshArtifacts = useAtomRefresh(artifactsQuery);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onDelete = async () => {
    if (
      deleting ||
      !window.confirm("¿Borrar estos apuntes? Podrás volver a generarlos.")
    ) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      await deleteArtifact(noteId);
      refreshArtifacts();
    } catch (cause) {
      const notice = describeFailure(
        cause,
        { area: "notes", action: "delete" },
        "MaterialPanel",
      );
      setError(notice.description ?? notice.title);
      setDeleting(false);
    }
  };

  return AsyncResult.matchWithError(note, {
    onInitial: () => <p className="p-4 text-muted">Cargando los apuntes…</p>,
    onError: (cause) => {
      const notice = describeFailure(
        cause,
        { area: "notes", action: "load" },
        "MaterialPanel",
      );
      return (
        <p className="p-4 text-danger-ink">
          {notice.title} {notice.description}
        </p>
      );
    },
    onDefect: (defect) => (
      <p className="p-4 text-danger-ink">{DEFECT_MESSAGE}</p>
    ),
    onSuccess: ({ value }) =>
      value.kind !== "note" ? (
        <p className="p-4 text-danger-ink">
          El artefacto {noteId} no es un apunte.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-1">
          {error !== undefined && (
            <p className="mb-3 shrink-0 border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">
              {error}
            </p>
          )}
          <NoteWorkspace
            key={value.id}
            onDelete={() => void onDelete()}
            deleting={deleting}
            artifact={value}
            onOpenCitation={onOpenCitation}
            requestedTopicPages={requestedTopicPages}
            onRequestedTopicPagesConsumed={onRequestedTopicPagesConsumed}
          />
        </div>
      ),
  });
}

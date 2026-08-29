import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type { MaterialIndex } from "@proxus/shared";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { artifactQuery, artifactsQuery, deleteArtifactAction } from "../domain/artifacts/atoms.ts";
import { materialIndexQuery, materialPageKey, materialPageQuery, materialsQuery } from "../domain/materials/atoms.ts";
import { streamGenerateNotes } from "../domain/artifacts/note-generation-stream.ts";
import { NoteWorkspace } from "./note/NoteWorkspace.tsx";
import {
  LABEL_FONT_PX,
  LABEL_FONT_WEIGHT,
  layoutMindMap,
  type MeasureText,
  type MindMapEdge,
  type MindMapNode
} from "../domain/materials/mindmap-layout.ts";
import { streamReindexMaterial } from "../domain/materials/stream.ts";

interface MaterialPanelProps {
  readonly materialId: string;
  readonly indexState: "indexed" | "not-indexed";
  readonly title: string;
  readonly pageCount: number;
}

type Tab = "pdf" | "mindmap" | "notes";

// Marca de procedencia de una página, tal como la pinta el visor.
type PageMarker = null | { readonly kind: "extracted" | "transcribed" } | { readonly kind: "failed"; readonly reason: string };

export function MaterialPanel({ materialId, indexState, title, pageCount }: MaterialPanelProps) {
  const indexed = indexState === "indexed";
  const [tab, setTab] = useState<Tab>("pdf");
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  const openPageInPdf = (page: number) => {
    setTab("pdf");
    setPendingPage(page);
  };

  return (
    <main className="flex h-screen min-w-0 flex-col overflow-hidden border-border border-r bg-canvas/60 p-6 max-md:h-auto max-md:border-r-0 max-md:border-b">
      <header className="mb-4 shrink-0">
        <p className="mb-1 font-bold text-brand text-xs uppercase tracking-widest">Material</p>
        <h2 className="font-bold text-3xl text-heading">{title}</h2>
        <p className="mt-1 text-muted text-sm">{pageCount} páginas</p>
      </header>

      {!indexed && <ReindexBanner materialId={materialId} />}

      {indexed && (
        <div className="mb-4 flex shrink-0 gap-2">
          <TabButton active={tab === "pdf"} onClick={() => setTab("pdf")}>PDF</TabButton>
          <TabButton active={tab === "mindmap"} onClick={() => setTab("mindmap")}>Mapa mental</TabButton>
          <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>Apuntes</TabButton>
        </div>
      )}

      <div className={`min-h-0 flex-1 ${tab === "pdf" ? "flex flex-col" : "hidden"}`}>
        {indexed
          ? <IndexedPdfViewer materialId={materialId} pageCount={pageCount} scrollTo={pendingPage} onScrolled={() => setPendingPage(null)} />
          : <PageList materialId={materialId} pageCount={pageCount} markerFor={() => null} scrollTo={pendingPage} onScrolled={() => setPendingPage(null)} />}
      </div>

      {indexed && (
        <div className={`min-h-0 flex-1 ${tab === "mindmap" ? "flex flex-col" : "hidden"}`}>
          <MindMapTab materialId={materialId} title={title} onOpenPage={openPageInPdf} />
        </div>
      )}

      {indexed && (
        <div className={`min-h-0 flex-1 overflow-y-auto ${tab === "notes" ? "block" : "hidden"}`}>
          <NotesTab materialId={materialId} />
        </div>
      )}
    </main>
  );
}

function TabButton({ active, onClick, children }: { readonly active: boolean; readonly onClick: () => void; readonly children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 font-medium text-sm ${
        active ? "border border-brand bg-brand-soft text-heading" : "border border-border text-muted hover:text-heading"
      }`}
    >
      {children}
    </button>
  );
}

// --- Visor del PDF -----------------------------------------------------------

function IndexedPdfViewer({
  materialId,
  pageCount,
  scrollTo,
  onScrolled
}: {
  readonly materialId: string;
  readonly pageCount: number;
  readonly scrollTo: number | null;
  readonly onScrolled: () => void;
}) {
  const index = useAtomValue(materialIndexQuery(materialId));

  const markerFor = (page: number): PageMarker => AsyncResult.matchWithError(index, {
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
    }
  });

  return <PageList materialId={materialId} pageCount={pageCount} markerFor={markerFor} scrollTo={scrollTo} onScrolled={onScrolled} />;
}

function PageList({
  materialId,
  pageCount,
  markerFor,
  scrollTo,
  onScrolled
}: {
  readonly materialId: string;
  readonly pageCount: number;
  readonly markerFor: (page: number) => PageMarker;
  readonly scrollTo: number | null;
  readonly onScrolled: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo === null) {
      return;
    }
    const target = containerRef.current?.querySelector(`[data-page="${scrollTo}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    onScrolled();
  }, [scrollTo, onScrolled]);

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border bg-canvas p-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        {pages.map((page) => (
          <PdfPage key={page} materialId={materialId} page={page} marker={markerFor(page)} />
        ))}
      </div>
    </div>
  );
}

function PdfPage({ materialId, page, marker }: { readonly materialId: string; readonly page: number; readonly marker: PageMarker }) {
  const ref = useRef<HTMLElement>(null);
  const [show, setShow] = useState(page <= 2);

  useEffect(() => {
    if (show || ref.current === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [show]);

  return (
    <figure ref={ref} data-page={page} className="scroll-mt-3">
      <div className="relative">
        {show
          ? <PdfPageImage materialId={materialId} page={page} />
          : <div className="grid h-[70vh] place-items-center rounded-lg border border-border bg-surface text-muted text-sm">Página {page}</div>}
        {marker?.kind === "transcribed" && (
          <span className="absolute top-2 right-2 rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
            transcrito por el modelo
          </span>
        )}
      </div>
      {marker?.kind === "failed" && (
        <figcaption className="mt-1 rounded-lg bg-danger/10 px-3 py-2 text-danger-ink text-sm">
          Página {page}: no se pudo indexar. {marker.reason}
        </figcaption>
      )}
    </figure>
  );
}

function PdfPageImage({ materialId, page }: { readonly materialId: string; readonly page: number }) {
  const image = useAtomValue(materialPageQuery(materialPageKey(materialId, page)));

  return AsyncResult.matchWithError(image, {
    onInitial: () => <PagePlaceholder>Cargando la página {page}…</PagePlaceholder>,
    onError: (error) => <PageError page={page} detail={String(error)} />,
    onDefect: (defect) => <PageError page={page} detail={String(defect)} />,
    onSuccess: ({ value }) => (
      <img src={value.data} alt={`Página ${page}`} className="w-full rounded-lg border border-border" loading="lazy" />
    )
  });
}

function PagePlaceholder({ children }: { readonly children: ReactNode }) {
  return <div className="grid h-[70vh] place-items-center rounded-lg border border-border bg-surface text-muted text-sm">{children}</div>;
}

function PageError({ page, detail }: { readonly page: number; readonly detail: string }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger-ink text-sm">
      No se pudo renderizar la página {page}. {detail}
    </div>
  );
}

// --- Mapa mental -----------------------------------------------------------

function MindMapTab({
  materialId,
  title,
  onOpenPage
}: {
  readonly materialId: string;
  readonly title: string;
  readonly onOpenPage: (page: number) => void;
}) {
  const index = useAtomValue(materialIndexQuery(materialId));

  return AsyncResult.matchWithError(index, {
    onInitial: () => <p className="text-muted">Cargando el mapa…</p>,
    onError: (error) => <p className="text-danger-ink">No se pudo cargar el índice: {String(error)}</p>,
    onDefect: (defect) => <p className="text-danger-ink">No se pudo cargar el índice: {String(defect)}</p>,
    onSuccess: ({ value }) => value.topics.length === 0
      ? <p className="text-muted">El modelo no detectó temas en este material.</p>
      : <MindMap index={value} title={title} onOpenPage={onOpenPage} />
  });
}

// Medidor de texto real, para dimensionar las cajas de forma que quepa toda la etiqueta. Un canvas
// fuera de pantalla reutilizado; si no hay DOM (no debería en el navegador), cae a una estimación.
let measureContext: CanvasRenderingContext2D | null | undefined;
const measureText: MeasureText = (text, fontPx, fontWeight) => {
  if (measureContext === undefined) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (measureContext === null) {
    return text.length * fontPx * 0.58;
  }
  measureContext.font = `${fontWeight} ${fontPx}px "Montserrat", ui-sans-serif, system-ui, sans-serif`;
  return measureContext.measureText(text).width;
};

// Un tono por grupo de primer nivel. El subtema usa el mismo tono, más claro (menos mezcla de color).
const GROUP_HUES = [262, 330, 25, 150, 200, 45];
const hueOf = (groupIndex: number): number => GROUP_HUES[groupIndex % GROUP_HUES.length] ?? 262;

const nodeFill = (node: MindMapNode, colorByGroup: boolean): string => {
  if (node.kind === "material") {
    return "var(--color-brand-soft)";
  }
  if (!colorByGroup || node.groupIndex === null) {
    return node.kind === "topic" ? "var(--color-surface)" : "var(--color-surface-muted)";
  }
  const mix = node.kind === "topic" ? 26 : 12;
  return `color-mix(in srgb, hsl(${hueOf(node.groupIndex)} 70% 55%) ${mix}%, var(--color-surface))`;
};

const nodeStroke = (node: MindMapNode, colorByGroup: boolean): string => {
  if (colorByGroup && node.groupIndex !== null && node.kind !== "material") {
    return `color-mix(in srgb, hsl(${hueOf(node.groupIndex)} 70% 50%) 60%, var(--color-border))`;
  }
  return "var(--color-border)";
};

function MindMap({
  index,
  title,
  onOpenPage
}: {
  readonly index: MaterialIndex;
  readonly title: string;
  readonly onOpenPage: (page: number) => void;
}) {
  const [colorByGroup, setColorByGroup] = useState(false);
  const model = useMemo(() => layoutMindMap(index.topics, title, measureText), [index.topics, title]);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-border bg-canvas p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-sm">Pulsa un tema para abrir su primera página en el PDF.</p>
        <button
          type="button"
          onClick={() => setColorByGroup((value) => !value)}
          aria-pressed={colorByGroup}
          className={`rounded-full border px-3 py-1 text-xs ${
            colorByGroup ? "border-brand bg-brand-soft text-heading" : "border-border text-muted hover:text-heading"
          }`}
        >
          {colorByGroup ? "Colores por grupo: sí" : "Colores por grupo"}
        </button>
      </div>
      <svg viewBox={`0 0 ${model.width} ${model.height}`} width={model.width} height={model.height} role="img" aria-label={`Mapa mental de ${title}`}>
        {model.edges.map((edge, i) => (
          <path key={i} d={edgePath(edge)} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.5} />
        ))}
        {model.nodes.map((node) => (
          <MindMapNodeView key={node.id} node={node} colorByGroup={colorByGroup} onOpenPage={onOpenPage} />
        ))}
      </svg>
    </div>
  );
}

function MindMapNodeView({
  node,
  colorByGroup,
  onOpenPage
}: {
  readonly node: MindMapNode;
  readonly colorByGroup: boolean;
  readonly onOpenPage: (page: number) => void;
}) {
  const target = node.kind !== "material" && node.pages.length > 0 ? Math.min(...node.pages) : null;
  const firstBaseline = 11 + LABEL_FONT_PX;

  return (
    <g
      transform={`translate(${node.x} ${node.y - node.height / 2})`}
      onClick={target === null ? undefined : () => onOpenPage(target)}
      style={{ cursor: target === null ? "default" : "pointer" }}
    >
      <title>{node.label}{node.pagesText === "" ? "" : ` · ${node.pagesText}`}</title>
      <rect
        width={node.width}
        height={node.height}
        rx={12}
        fill={nodeFill(node, colorByGroup)}
        stroke={nodeStroke(node, colorByGroup)}
        strokeWidth={1}
      />
      {node.lines.map((line, i) => (
        <text key={i} x={14} y={firstBaseline + i * 17} fill="var(--color-heading)" fontSize={LABEL_FONT_PX} fontWeight={LABEL_FONT_WEIGHT}>
          {line}
        </text>
      ))}
      {node.pagesText !== "" && (
        <text x={14} y={firstBaseline + (node.lines.length - 1) * 17 + 15} fill="var(--color-muted)" fontSize={11}>
          {node.pagesText}
        </text>
      )}
    </g>
  );
}

const edgePath = ({ fromX, fromY, toX, toY }: MindMapEdge): string => {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
};

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
          setLines((current) => [...current, `Índice listo: ${event.index.pages.length} páginas, ${event.index.topics.length} temas.`]);
        }
      }
      refreshMaterials();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-4 shrink-0 rounded-2xl border border-dashed border-border bg-surface/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-heading">Temas sin generar</h3>
          <p className="text-muted text-sm">El PDF ya se ve abajo. Indexar detecta los temas y arma el mapa mental.</p>
        </div>
        <button
          className="rounded-full border border-border-strong bg-surface px-5 py-2.5 font-medium text-heading hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? "Indexando…" : "Indexar"}
        </button>
      </div>

      {lines.length > 0 && (
        <ul className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-border bg-canvas p-3 text-muted text-sm">
          {lines.map((line, index) => <li key={index}>{line}</li>)}
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
function NotesTab({ materialId }: { readonly materialId: string }) {
  const artifacts = useAtomValue(artifactsQuery);

  return AsyncResult.matchWithError(artifacts, {
    onInitial: () => <p className="p-4 text-muted">Cargando los apuntes…</p>,
    onError: (error) => <p className="p-4 text-danger-ink">No se pudieron cargar los apuntes: {String(error)}</p>,
    onDefect: (defect) => <p className="p-4 text-danger-ink">No se pudieron cargar los apuntes: {String(defect)}</p>,
    onSuccess: ({ value }) => {
      const summary = value.artifacts.find(
        (artifact) => artifact.kind === "note" && artifact.materialId === materialId
      );
      return summary === undefined
        ? <GenerateNoteCard materialId={materialId} />
        : <ExistingNote noteId={summary.id} />;
    }
  });
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
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-surface/40 p-10 text-center">
      <div>
        <h3 className="font-bold text-heading text-xl">Este material no tiene apuntes todavía.</h3>
        <p className="mt-2 max-w-md text-muted">
          Se arma un bloque por cada tema del índice del material, con la prosa redactada a partir de sus páginas. Puedes editarlos después.
        </p>
        <button
          type="button"
          className="mt-4 rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void run()}
          disabled={running}
        >
          {running ? "Creando apuntes…" : "Crear apuntes"}
        </button>
        {running && (
          <p className="mt-3 text-muted text-sm">{progress ?? "Leyendo el índice del material…"}</p>
        )}
        {error !== undefined && (
          <p className="mt-3 text-danger-ink">No se pudieron crear los apuntes: {error}</p>
        )}
      </div>
    </div>
  );
}

function ExistingNote({ noteId }: { readonly noteId: string }) {
  const note = useAtomValue(artifactQuery(noteId));
  const deleteArtifact = useAtomSet(deleteArtifactAction, { mode: "promise" });
  const refreshArtifacts = useAtomRefresh(artifactsQuery);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const onDelete = async () => {
    if (deleting || !window.confirm("¿Borrar estos apuntes? Podrás volver a generarlos.")) {
      return;
    }
    setDeleting(true);
    setError(undefined);
    try {
      await deleteArtifact(noteId);
      refreshArtifacts();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setDeleting(false);
    }
  };

  return AsyncResult.matchWithError(note, {
    onInitial: () => <p className="p-4 text-muted">Cargando los apuntes…</p>,
    onError: (cause) => <p className="p-4 text-danger-ink">No se pudieron cargar los apuntes: {String(cause)}</p>,
    onDefect: (defect) => <p className="p-4 text-danger-ink">No se pudieron cargar los apuntes: {String(defect)}</p>,
    onSuccess: ({ value }) => value.kind !== "note"
      ? <p className="p-4 text-danger-ink">El artefacto {noteId} no es un apunte.</p>
      : (
          <div className="p-1">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-border-strong px-4 py-1.5 text-body text-sm hover:border-danger hover:text-danger-ink disabled:opacity-50"
                onClick={() => void onDelete()}
                disabled={deleting}
              >
                {deleting ? "Borrando…" : "Borrar apunte"}
              </button>
            </div>
            {error !== undefined && (
              <p className="mb-3 rounded-2xl border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{error}</p>
            )}
            <NoteWorkspace key={value.id} artifact={value} />
          </div>
        )
  });
}

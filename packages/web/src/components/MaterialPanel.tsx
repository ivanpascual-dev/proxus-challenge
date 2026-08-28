import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { MaterialIndex, MaterialPageEntry, MaterialPageView } from "@proxus/shared";
import { useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialIndexQuery, materialPageKey, materialPageQuery, materialsQuery } from "../domain/materials/atoms.ts";
import { streamReindexMaterial } from "../domain/materials/stream.ts";

interface MaterialPanelProps {
  readonly materialId: string;
  readonly indexState: "indexed" | "not-indexed";
  readonly title: string;
  readonly pageCount: number;
}

export function MaterialPanel({ materialId, indexState, title, pageCount }: MaterialPanelProps) {
  return (
    <main className="h-screen min-w-0 overflow-y-auto border-border border-r bg-canvas/60 p-6 max-md:h-auto max-md:border-r-0 max-md:border-b">
      <header className="mb-5">
        <p className="mb-1 font-bold text-brand text-xs uppercase tracking-widest">Material</p>
        <h2 className="font-bold text-3xl text-heading">{title}</h2>
        <p className="mt-1 text-muted text-sm">{pageCount} páginas</p>
      </header>

      {indexState === "not-indexed"
        ? <ReindexPanel materialId={materialId} />
        : <IndexedMaterial materialId={materialId} />}
    </main>
  );
}

function ReindexPanel({ materialId }: { readonly materialId: string }) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | undefined>();
  // Al terminar, refrescar la lista basta: el material pasa a "indexed" y este panel se sustituye
  // por IndexedMaterial, que monta la consulta del índice ya con datos.
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
    <div className="rounded-3xl border border-dashed border-border bg-surface/50 p-6">
      <h3 className="font-semibold text-heading text-lg">Este material no está indexado</h3>
      <p className="mt-2 max-w-xl text-muted">
        Indexar extrae el texto de cada página (o lo transcribe con el modelo si la página es imagen) y
        detecta los temas. Puede tardar varios minutos en materiales grandes.
      </p>
      <button
        className="mt-4 rounded-full border border-border-strong bg-surface px-5 py-2.5 font-medium text-heading hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        onClick={() => void run()}
        disabled={running}
      >
        {running ? "Indexando…" : "Indexar"}
      </button>

      {lines.length > 0 && (
        <ul className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-border bg-canvas p-3 text-muted text-sm">
          {lines.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      )}
      {error !== undefined && (
        <p className="mt-3 text-danger-ink">La indexación falló: {error}</p>
      )}
    </div>
  );
}

function IndexedMaterial({ materialId }: { readonly materialId: string }) {
  const index = useAtomValue(materialIndexQuery(materialId));
  const [openPage, setOpenPage] = useState<number | null>(null);

  return AsyncResult.matchWithError(index, {
    onInitial: () => <p className="text-muted">Cargando el índice…</p>,
    onError: (error) => <p className="text-danger-ink">No se pudo cargar el índice: {String(error)}</p>,
    onDefect: (defect) => <p className="text-danger-ink">No se pudo cargar el índice: {String(defect)}</p>,
    onSuccess: ({ value }) => value.pages.length === 0 && value.failedPages.length === 0
      ? <p className="text-muted">El índice no tiene páginas.</p>
      : (
          <div className="grid gap-6">
            <TopicList index={value} />
            <PageGrid index={value} openPage={openPage} onOpenPage={setOpenPage} />
            {openPage !== null && <PageView materialId={materialId} page={openPage} />}
          </div>
        )
  });
}

function TopicList({ index }: { readonly index: MaterialIndex }) {
  if (index.topics.length === 0) {
    return <p className="text-muted text-sm">El modelo no devolvió temas para este material.</p>;
  }
  return (
    <div>
      <h3 className="mb-2 font-semibold text-body text-sm uppercase tracking-widest">Temas</h3>
      <ul className="flex flex-wrap gap-2">
        {index.topics.map((topic) => (
          <li key={topic.id} className="rounded-full border border-border bg-surface px-3 py-1 text-body text-sm">
            {topic.label} <span className="text-muted">· {topic.pages.length} pág.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PageGrid({
  index,
  openPage,
  onOpenPage
}: {
  readonly index: MaterialIndex;
  readonly openPage: number | null;
  readonly onOpenPage: (page: number) => void;
}) {
  const failed = new Set(index.failedPages.map((entry) => entry.page));
  const pages = Array.from({ length: index.pageCount }, (_, i) => i + 1);
  const provenanceByPage = new Map(index.pages.map((entry) => [entry.page, entry.provenance]));

  return (
    <div>
      <h3 className="mb-2 font-semibold text-body text-sm uppercase tracking-widest">Páginas</h3>
      <div className="flex flex-wrap gap-2">
        {pages.map((page) => {
          const provenance = provenanceByPage.get(page);
          const isFailed = failed.has(page);
          return (
            <button
              key={page}
              type="button"
              onClick={() => onOpenPage(page)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:border-brand ${
                openPage === page ? "border-brand bg-brand-soft" : "border-border bg-surface"
              }`}
            >
              <span className="font-medium text-heading">{page}</span>
              <ProvenanceDot provenance={provenance} isFailed={isFailed} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-muted text-xs">
        <span><Dot className="bg-success" /> extraído del PDF</span>
        <span><Dot className="bg-warning" /> transcrito por el modelo</span>
        <span><Dot className="bg-danger" /> no indexado</span>
      </p>
    </div>
  );
}

function ProvenanceDot({ provenance, isFailed }: { readonly provenance: string | undefined; readonly isFailed: boolean }) {
  if (isFailed) {
    return <Dot className="bg-danger" />;
  }
  return <Dot className={provenance === "extracted" ? "bg-success" : "bg-warning"} />;
}

function Dot({ className }: { readonly className: string }) {
  return <span className={`inline-block size-2 rounded-full ${className}`} />;
}

function PageView({ materialId, page }: { readonly materialId: string; readonly page: number }) {
  const view = useAtomValue(materialPageQuery(materialPageKey(materialId, page)));

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 font-semibold text-heading">Página {page}</h3>
      {AsyncResult.matchWithError(view, {
        onInitial: () => <p className="text-muted">Cargando la página…</p>,
        onError: (error) => <p className="text-danger-ink">No se pudo cargar la página: {String(error)}</p>,
        onDefect: (defect) => <p className="text-danger-ink">No se pudo cargar la página: {String(defect)}</p>,
        onSuccess: ({ value }) => <PageContent view={value} />
      })}
    </section>
  );
}

function PageContent({ view }: { readonly view: MaterialPageView }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <img
        src={view.image.data}
        alt={`Render de la página ${view.image.page}`}
        className="w-full rounded-lg border border-border"
      />
      <div>
        <ProvenanceLabel entry={view.entry} />
        <IndexedText entry={view.entry} />
      </div>
    </div>
  );
}

function ProvenanceLabel({ entry }: { readonly entry: MaterialPageEntry }) {
  if ("reason" in entry) {
    return (
      <p className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-danger-ink text-sm">
        Esta página no se pudo indexar: {entry.reason}
      </p>
    );
  }
  return (
    <p className="mb-2 text-muted text-sm">
      Texto {entry.provenance === "extracted" ? "extraído del PDF" : "transcrito por el modelo a partir de la imagen"}.
      {" "}
      El render de la izquierda es la página real; ese texto es la fuente de la verdad.
    </p>
  );
}

function IndexedText({ entry }: { readonly entry: MaterialPageEntry }) {
  if ("reason" in entry) {
    return null;
  }
  return (
    <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-canvas p-3 text-body text-sm">
      {entry.text.length === 0 ? "(página en blanco)" : entry.text}
    </pre>
  );
}

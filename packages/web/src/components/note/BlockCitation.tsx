import { useAtomValue } from "@effect/atom-react";
import type { MaterialBlockSource } from "@proxus/shared";
import { useState, type ReactNode } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialPageKey, materialPageQuery } from "../../domain/materials/atoms.ts";

interface BlockCitationProps {
  readonly source: MaterialBlockSource;
}

const pagesLabel = (pages: readonly number[]) =>
  pages.length === 0
    ? "sin páginas"
    : pages.length === 1
      ? `página ${pages[0]}`
      : `páginas ${[...pages].sort((a, b) => a - b).join(", ")}`;

// La cita de un bloque que sale de un material: de qué páginas sale, si el texto lo transcribió el
// modelo, el motivo cuando la cita no ancla (invariante 3), y un desplegable con el renderizado real
// de la página (invariante 8: la página es la verdad, no el texto indexado).
export function BlockCitation({ source }: BlockCitationProps) {
  const [open, setOpen] = useState(false);
  const anchored = source.unanchoredReason === null;

  return (
    <aside className="mt-3 rounded-2xl border border-border bg-canvas/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-muted">
        <span className="font-semibold text-body">
          Material «{source.materialId}», {pagesLabel(source.pages)}
        </span>
        {source.transcribed && (
          <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
            transcrito por el modelo
          </span>
        )}
        {source.excerptTruncated && (
          <span className="rounded-full bg-border-strong/40 px-2 py-0.5 text-[0.7rem] text-muted">
            fragmento recortado
          </span>
        )}
      </div>

      {!anchored && (
        <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-danger-ink">
          La cita no se pudo comprobar contra el índice: {source.unanchoredReason}
        </p>
      )}

      {source.pages.length > 0 && (
        <button
          type="button"
          className="mt-2 rounded-lg border border-border px-2 py-1 text-muted text-xs hover:border-brand hover:text-brand"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? "Ocultar la página" : "Ver la página"}
        </button>
      )}

      {open && (
        <div className="mt-3 grid gap-3">
          {[...source.pages].sort((a, b) => a - b).map((page) => (
            <CitedPage key={page} materialId={source.materialId} page={page} />
          ))}
        </div>
      )}
    </aside>
  );
}

function CitedPage({ materialId, page }: { readonly materialId: string; readonly page: number }) {
  const image = useAtomValue(materialPageQuery(materialPageKey(materialId, page)));

  return (
    <figure>
      <figcaption className="mb-1 text-muted text-xs">Página {page}</figcaption>
      {AsyncResult.matchWithError(image, {
        onInitial: () => <PageBox>Cargando la página {page}…</PageBox>,
        onError: (error) => <PageBox tone="error">No se pudo cargar la página {page}. {String(error)}</PageBox>,
        onDefect: (defect) => <PageBox tone="error">No se pudo cargar la página {page}. {String(defect)}</PageBox>,
        onSuccess: ({ value }) => (
          <img src={value.data} alt={`Página ${page}`} className="w-full rounded-lg border border-border" loading="lazy" />
        )
      })}
    </figure>
  );
}

function PageBox({ children, tone }: { readonly children: ReactNode; readonly tone?: "error" }) {
  return (
    <div
      className={`grid min-h-24 place-items-center rounded-lg border p-4 text-center text-sm ${
        tone === "error" ? "border-danger/40 bg-danger/10 text-danger-ink" : "border-border bg-surface text-muted"
      }`}
    >
      {children}
    </div>
  );
}

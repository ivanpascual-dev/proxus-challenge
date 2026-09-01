import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type UrlSourceResult } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { fetchUrlSourceAction } from "../../domain/artifacts/atoms.ts";
import { describeFailure } from "../../lib/user-feedback.ts";

interface AddFromUrlProps {
  readonly onAdd: (result: UrlSourceResult) => void;
}

// Traer una URL como fuente de un bloque nuevo (fase 2, tramo 2C). El servidor aplica las siete
// guardas, guarda el fragmento crudo como recibo (F2-25) y redacta un borrador del cuerpo. Aquí se
// enseñan los dos antes de añadir.
export function AddFromUrl({ onAdd }: AddFromUrlProps) {
  const fetchSource = useAtomSet(fetchUrlSourceAction, { mode: "promise" });
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<UrlSourceResult | null>(null);

  const reset = () => {
    setUrl("");
    setError(undefined);
    setPreview(null);
    setOpen(false);
  };

  const onFetch = async () => {
    if (url.trim().length === 0 || isFetching) {
      return;
    }
    setIsFetching(true);
    setError(undefined);
    setPreview(null);
    try {
      setPreview(await fetchSource(url.trim()));
    } catch (cause) {
      const notice = describeFailure(cause, { area: "notes", action: "source" }, "AddFromUrl");
      setError(notice.description ?? notice.title);
    } finally {
      setIsFetching(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className="rounded-3xl border border-dashed border-border p-4 text-muted hover:border-brand hover:text-brand"
        onClick={() => setOpen(true)}
      >
        + Añadir un bloque desde una URL
      </button>
    );
  }

  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-heading text-sm">Añadir desde una URL</p>
        <button type="button" className="text-muted text-sm hover:text-brand" onClick={reset}>
          Cancelar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-64 flex-1 rounded-2xl border border-border-strong bg-canvas p-2 text-heading text-sm outline-none focus:border-brand"
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onFetch();
            }
          }}
          placeholder="https://…"
          inputMode="url"
        />
        <button
          type="button"
          className="rounded-full bg-brand px-4 py-2 font-semibold text-on-brand text-sm hover:bg-brand/90 disabled:opacity-50"
          disabled={url.trim().length === 0 || isFetching}
          onClick={onFetch}
        >
          {isFetching ? "Trayendo…" : "Traer"}
        </button>
      </div>
      <p className="text-muted text-xs">
        Solo `https`. El servidor descarga la página, comprueba que no apunta a una dirección interna,
        guarda un fragmento de hasta {Math.round(LIMITS.maxSourceExcerptCharacters / 1000)} 000 caracteres
        y redacta un borrador del bloque.
      </p>

      {error !== undefined && (
        <p className="rounded-2xl border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{error}</p>
      )}

      {preview !== null && (
        <div className="grid gap-2 rounded-2xl border border-brand/50 bg-brand/5 p-3">
          <p className="font-semibold text-body text-sm">{preview.source.title || "(la página no tiene título)"}</p>
          <p className="break-all text-muted text-xs">{preview.source.url}</p>

          {preview.draft !== null
            ? (
                <div className="prose dark:prose-invert max-w-none rounded-xl bg-canvas/60 p-3 text-sm">
                  <p className="mb-1 font-bold text-brand text-[0.7rem] uppercase tracking-widest">Borrador del bloque</p>
                  <Streamdown>{preview.draft}</Streamdown>
                </div>
              )
            : (
                <p className="rounded-xl bg-canvas/60 p-3 text-muted text-sm italic">
                  No se pudo redactar un borrador de esta página. El bloque se añadirá vacío para que lo
                  escribas tú; el fragmento queda guardado como fuente.
                </p>
              )}

          <details className="rounded-xl bg-canvas/60 p-3 text-sm">
            <summary className="cursor-pointer text-muted text-xs">Ver el fragmento extraído (el recibo)</summary>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-muted">
              {preview.source.excerpt || "(no se extrajo texto de la página)"}
            </p>
            {preview.source.excerptTruncated && (
              <span className="mt-1 inline-block rounded-full bg-border-strong/40 px-2 py-0.5 text-[0.7rem] text-muted">
                fragmento recortado
              </span>
            )}
          </details>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-full bg-brand px-4 py-1.5 font-semibold text-on-brand text-sm hover:bg-brand/90"
              onClick={() => {
                onAdd(preview);
                reset();
              }}
            >
              Añadir como bloque
            </button>
            <button
              type="button"
              className="rounded-full border border-border px-4 py-1.5 text-sm hover:border-brand"
              onClick={() => setPreview(null)}
            >
              Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

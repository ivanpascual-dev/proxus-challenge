import { useAtomSet } from "@effect/atom-react";
import { LIMITS, type UrlSourceResult } from "@proxus/shared";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { fetchUrlSourceAction } from "../../domain/artifacts/atoms.ts";
import { describeFailure } from "../../lib/user-feedback.ts";

interface AddFromUrlProps {
  readonly onAdd: (result: UrlSourceResult) => void;
  readonly onCancel: () => void;
}

// Traer una URL como fuente de un bloque nuevo (fase 2, tramo 2C). El servidor aplica las siete
// guardas, guarda el fragmento crudo como recibo (F2-25) y redacta un borrador del cuerpo. Aquí se
// enseñan los dos antes de añadir. Vive dentro de un `Dialog` (§4.8): el abrir/cerrar ya no es suyo.
export function AddFromUrl({ onAdd, onCancel }: AddFromUrlProps) {
  const fetchSource = useAtomSet(fetchUrlSourceAction, { mode: "promise" });
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<UrlSourceResult | null>(null);

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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-64 flex-1 border border-border-strong bg-canvas p-2 text-heading text-sm outline-none focus:border-brand"
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onFetch();
            }
          }}
          placeholder="https://…"
          inputMode="url"
          autoFocus
        />
        <button
          type="button"
          className="font-semibold text-brand text-sm transition hover:underline active:scale-[0.98] disabled:opacity-50"
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
        <p className="border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{error}</p>
      )}

      {preview !== null && (
        <div className="grid gap-2 border border-brand/50 bg-brand/5 p-3">
          <p className="font-semibold text-body text-sm">{preview.source.title || "(la página no tiene título)"}</p>
          <p className="break-all text-muted text-xs">{preview.source.url}</p>

          {preview.draft !== null
            ? (
                <div className="prose dark:prose-invert max-w-none bg-canvas/60 p-3 text-sm">
                  <p className="mb-1 font-bold text-brand text-[0.7rem] uppercase tracking-widest">Borrador del bloque</p>
                  <Streamdown>{preview.draft}</Streamdown>
                </div>
              )
            : (
                <p className="bg-canvas/60 p-3 text-muted text-sm italic">
                  No se pudo redactar un borrador de esta página. El bloque se añadirá vacío para que lo
                  escribas tú; el fragmento queda guardado como fuente.
                </p>
              )}

          <details className="bg-canvas/60 p-3 text-sm">
            <summary className="cursor-pointer text-muted text-xs">Ver el fragmento extraído (el recibo)</summary>
            <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-muted">
              {preview.source.excerpt || "(no se extrajo texto de la página)"}
            </p>
            {preview.source.excerptTruncated && (
              <span className="mt-1 inline-block bg-border-strong/40 px-2 py-0.5 text-[0.7rem] text-muted">
                fragmento recortado
              </span>
            )}
          </details>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="font-semibold text-brand text-sm transition hover:underline active:scale-[0.98]"
              onClick={() => onAdd(preview)}
            >
              Añadir como bloque
            </button>
            <button
              type="button"
              className="font-medium text-muted text-sm transition hover:text-heading hover:underline active:scale-[0.98]"
              onClick={() => setPreview(null)}
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" className="text-muted text-sm transition hover:text-brand hover:underline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

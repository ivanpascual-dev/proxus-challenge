import { useId, useRef, useState } from "react";
import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { artifactsQuery } from "../domain/artifacts/atoms.ts";
import { streamGenerateNotes } from "../domain/artifacts/note-generation-stream.ts";
import { materialsQuery, uploadMaterialsAction } from "../domain/materials/atoms.ts";
import { streamReindexMaterial } from "../domain/materials/stream.ts";
import { messageOf } from "../lib/error-message.ts";

type UploadStage = "uploading" | "indexing" | "generating-notes" | "done" | "rejected" | "error";

interface FileUploadState {
  readonly key: string;
  readonly fileName: string;
  readonly stage: UploadStage;
  readonly message?: string | undefined;
}

// El mapa mental no es un paso propio de la cadena: sale del mismo índice que arma esta fase, así
// que la etiqueta lo nombra a los dos en vez de fingir un paso que no existe.
const STAGE_LABEL: Record<UploadStage, string> = {
  uploading: "Subiendo…",
  indexing: "Analizando el documento (índice y mapa mental)…",
  "generating-notes": "Generando apuntes…",
  done: "Listo",
  rejected: "Rechazado",
  error: "Error"
};

// Arrastrar PDFs a esta zona sube, indexa y genera los apuntes en cadena, sin pulsar nada (fase 4,
// decisión 3). El cliente orquesta la cadena llamando a las rutas NDJSON que ya existen (asunción
// A3): si se cierra la pestaña a mitad, se interrumpe, pero el material ya subido sigue ahí y los
// botones manuales de "Indexar" / "Crear apuntes" del panel del material lo retoman.
export function UploadDropzone() {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<readonly FileUploadState[]>([]);
  const upload = useAtomSet(uploadMaterialsAction, { mode: "promise" });
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const refreshArtifacts = useAtomRefresh(artifactsQuery);

  const updateEntry = (key: string, patch: Partial<FileUploadState>) => {
    setUploads((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const runChain = async (key: string, materialId: string) => {
    try {
      for await (const event of streamReindexMaterial(materialId)) {
        if (event.type === "progress") {
          updateEntry(key, { stage: "indexing", message: event.message });
        } else if (event.type === "failed") {
          updateEntry(key, { stage: "error", message: event.message });
          return;
        }
      }
      refreshMaterials();

      updateEntry(key, { stage: "generating-notes", message: undefined });
      for await (const event of streamGenerateNotes(materialId)) {
        if (event.type === "progress") {
          updateEntry(key, { stage: "generating-notes", message: event.message });
        } else if (event.type === "failed") {
          updateEntry(key, { stage: "error", message: event.message });
          return;
        }
      }
      refreshArtifacts();
      updateEntry(key, { stage: "done", message: undefined });
    } catch (cause) {
      updateEntry(key, { stage: "error", message: messageOf(cause) });
    }
  };

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    const entries: FileUploadState[] = files.map((file) => ({
      key: `${file.name}-${crypto.randomUUID()}`,
      fileName: file.name,
      stage: "uploading"
    }));
    setUploads((current) => [...current, ...entries]);

    try {
      const response = await upload(files);
      response.results.forEach((result, index) => {
        const entry = entries[index];
        if (entry === undefined) {
          return;
        }
        if (result.outcome === "rejected") {
          updateEntry(entry.key, { stage: "rejected", message: result.reason.message });
        } else {
          updateEntry(entry.key, { stage: "indexing", message: undefined });
          void runChain(entry.key, result.material.id);
        }
      });
      refreshMaterials();
    } catch (cause) {
      const message = messageOf(cause);
      setUploads((current) => current.map((item) =>
        entries.some((entry) => entry.key === item.key) ? { ...item, stage: "error", message } : item
      ));
    }
  };

  return (
    <section className="mb-6">
      <div
        className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${
          dragging ? "border-brand bg-brand-soft" : "border-border bg-canvas/70"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <label htmlFor={inputId} className="cursor-pointer text-muted text-sm">
          Arrastra un PDF aquí, o{" "}
          <span className="font-semibold text-brand underline">elige un fichero</span>
        </label>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files !== null) {
              void handleFiles(event.target.files);
            }
            event.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {uploads.map((item) => (
            <li
              key={item.key}
              className={`rounded-xl border p-3 text-sm ${
                item.stage === "error" || item.stage === "rejected"
                  ? "border-danger/40 bg-danger/10"
                  : item.stage === "done"
                  ? "border-success/40 bg-success/10"
                  : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="truncate text-heading">{item.fileName}</strong>
                <span
                  className={
                    item.stage === "error" || item.stage === "rejected"
                      ? "text-danger-ink"
                      : item.stage === "done"
                      ? "text-success-ink"
                      : "text-muted"
                  }
                >
                  {STAGE_LABEL[item.stage]}
                </span>
              </div>
              {item.message !== undefined && (
                <p
                  className={
                    item.stage === "error" || item.stage === "rejected" ? "mt-1 text-danger-ink" : "mt-1 text-muted"
                  }
                >
                  {item.message}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

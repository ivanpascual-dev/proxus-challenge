import { useId, useRef, useState } from "react";
import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { artifactsQuery } from "../domain/artifacts/atoms.ts";
import { streamGenerateNotes } from "../domain/artifacts/note-generation-stream.ts";
import { materialsQuery, uploadMaterialsAction, validateMaterialsAction } from "../domain/materials/atoms.ts";
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

type StagedStatus = "validating" | "valid" | "rejected";

interface StagedFile {
  readonly key: string;
  readonly file: File;
  readonly status: StagedStatus;
  readonly message?: string | undefined;
}

// Zona previa a "Subir" (cierre de fase 4, punto 5 de la revisión de fiel-al-plan): al soltar los
// ficheros, cada uno se valida solo (tipo real de PDF, nombre duplicado) sin escribir nada en el
// servidor. Un rechazo se avisa con su motivo y una X para quitarlo; el botón "Subir" solo aparece
// cuando lo que queda en la zona está todo validado y en verde.
export function UploadDropzone() {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [staged, setStaged] = useState<readonly StagedFile[]>([]);
  const [uploads, setUploads] = useState<readonly FileUploadState[]>([]);
  const validate = useAtomSet(validateMaterialsAction, { mode: "promise" });
  const upload = useAtomSet(uploadMaterialsAction, { mode: "promise" });
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const refreshArtifacts = useAtomRefresh(artifactsQuery);

  const updateEntry = (key: string, patch: Partial<FileUploadState>) => {
    setUploads((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const updateStaged = (key: string, patch: Partial<StagedFile>) => {
    setStaged((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
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

  // Se dispara sola al soltar los ficheros, sin botón de "validar" (así lo pidió Iván al cerrar la
  // fase): cada fichero pasa a la zona previa en "validating" y el servidor comprueba tipo real y
  // nombre duplicado sin escribir nada.
  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    const entries: StagedFile[] = files.map((file) => ({
      key: `${file.name}-${crypto.randomUUID()}`,
      file,
      status: "validating"
    }));
    setStaged((current) => [...current, ...entries]);

    try {
      const response = await validate(files);
      response.results.forEach((result, index) => {
        const entry = entries[index];
        if (entry === undefined) {
          return;
        }
        updateStaged(entry.key, result.outcome === "rejected"
          ? { status: "rejected", message: result.reason.message }
          : { status: "valid", message: undefined });
      });
    } catch (cause) {
      const message = messageOf(cause);
      setStaged((current) => current.map((item) =>
        entries.some((entry) => entry.key === item.key) ? { ...item, status: "rejected", message } : item
      ));
    }
  };

  const removeStaged = (key: string) => {
    setStaged((current) => current.filter((item) => item.key !== key));
  };

  // Solo se habilita cuando lo que queda en la zona está todo validado y en verde: un rechazo lo
  // bloquea hasta que se quite con su X, nunca se sube en silencio junto a los que sí valen.
  const anyValidating = staged.some((item) => item.status === "validating");
  const anyRejected = staged.some((item) => item.status === "rejected");
  const canUpload = staged.length > 0 && !anyValidating && !anyRejected;

  const handleUpload = async () => {
    if (!canUpload) {
      return;
    }
    const ready = staged;
    setStaged([]);

    const entries: FileUploadState[] = ready.map((item) => ({
      key: item.key,
      fileName: item.file.name,
      stage: "uploading"
    }));
    setUploads((current) => [...current, ...entries]);

    try {
      const response = await upload(ready.map((item) => item.file));
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

      {staged.length > 0 && (
        <div className="mt-3">
          <ul className="grid gap-2">
            {staged.map((item) => (
              <li
                key={item.key}
                className={`rounded-xl border p-3 text-sm ${
                  item.status === "rejected"
                    ? "border-danger/40 bg-danger/10"
                    : item.status === "valid"
                    ? "border-success/40 bg-success/10"
                    : "border-border bg-surface"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <strong className="truncate text-heading">{item.file.name}</strong>
                  <div className="flex items-center gap-2">
                    <span className={item.status === "rejected" ? "text-danger-ink" : "text-muted"}>
                      {item.status === "validating" ? "Comprobando…" : item.status === "valid" ? "Listo para subir" : "Rechazado"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStaged(item.key)}
                      className="rounded-full border border-border-strong px-2 text-heading text-xs hover:border-danger"
                      aria-label={`Quitar ${item.file.name} de la lista`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {item.message !== undefined && <p className="mt-1 text-danger-ink">{item.message}</p>}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => void handleUpload()}
            className="mt-3 w-full rounded-full border border-border-strong bg-surface px-5 py-2 text-heading hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {canUpload
              ? `Subir ${staged.length} fichero${staged.length === 1 ? "" : "s"}`
              : anyValidating
              ? "Comprobando los ficheros…"
              : "Quita los ficheros rechazados para poder subir"}
          </button>
        </div>
      )}

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

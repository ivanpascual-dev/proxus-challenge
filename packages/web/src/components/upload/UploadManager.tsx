import { useId, useRef, useState } from "react";
import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { artifactsQuery } from "../../domain/artifacts/atoms.ts";
import { streamGenerateNotes } from "../../domain/artifacts/note-generation-stream.ts";
import { materialsQuery, uploadMaterialsAction, validateMaterialsAction } from "../../domain/materials/atoms.ts";
import { streamReindexMaterial } from "../../domain/materials/stream.ts";
import { describeFailure } from "../../lib/user-feedback.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Icon } from "../ui/Icon.tsx";
import { hasActiveWork, UploadQueue, type FileUploadState, type StagedFile } from "./UploadQueue.tsx";

// Absorbe el estado que antes vivía en `UploadDropzone` (fase 5, §4.2). La diferencia real: el
// diálogo es solo presentación. Este componente permanece montado siempre desde `Sidebar` (que nunca
// se desmonta), así que cerrar el diálogo no interrumpe ninguna validación ni cadena en curso; solo
// oculta su superficie. Reabrir devuelve la misma cola porque es el mismo estado de React, nunca se
// perdió. No se persiste al recargar y la orquestación sigue en cliente (deuda conocida del plan).
export function UploadManager() {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
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
      const notice = describeFailure(cause, { area: "materials", action: "index" }, "UploadManager");
      updateEntry(key, { stage: "error", message: notice.description ?? notice.title });
    }
  };

  // Se dispara sola al soltar los ficheros, sin botón de "validar": cada fichero pasa a la zona
  // previa en "validating" y el servidor comprueba tipo real y nombre duplicado sin escribir nada.
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
      const notice = describeFailure(cause, { area: "materials", action: "upload" }, "UploadManager");
      const message = notice.description ?? notice.title;
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
      // Rechazo agregado de `maxMaterials` (F4-04): la prevalidación no lo cubre, solo `upload` lo
      // comprueba de verdad, así que un fichero que llegó "válido" aquí puede volver como rechazado.
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
      const notice = describeFailure(cause, { area: "materials", action: "upload" }, "UploadManager");
      const message = notice.description ?? notice.title;
      setUploads((current) => current.map((item) =>
        entries.some((entry) => entry.key === item.key) ? { ...item, stage: "error", message } : item
      ));
    }
  };

  const activeWork = hasActiveWork(staged, uploads);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex w-full items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-4 py-2 font-medium text-heading text-sm hover:border-brand"
      >
        <Icon name="upload" size={16} />
        Subir material
        {activeWork && (
          <span className="-translate-y-1/2 absolute top-1/2 right-3 size-2 rounded-full bg-brand" aria-hidden="true" />
        )}
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Subir material" widthClassName="max-w-md">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-heading text-lg">Subir material</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-8 place-items-center rounded-[8px] text-muted hover:bg-surface-muted hover:text-heading">
              <Icon name="close" size={18} />
            </button>
          </div>

          <div
            className={`rounded-[10px] border-2 border-dashed p-4 text-center transition ${
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

          <UploadQueue
            staged={staged}
            uploads={uploads}
            canUpload={canUpload}
            anyValidating={anyValidating}
            onRemoveStaged={removeStaged}
            onUpload={() => void handleUpload()}
          />
        </div>
      </Dialog>
    </>
  );
}

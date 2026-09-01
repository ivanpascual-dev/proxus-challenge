import { useId, useRef, useState } from "react";
import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { LIMITS } from "@proxus/shared";
import { artifactsQuery } from "../../domain/artifacts/atoms.ts";
import { streamGenerateNotes } from "../../domain/artifacts/note-generation-stream.ts";
import { materialsQuery, uploadMaterialsAction, validateMaterialsAction } from "../../domain/materials/atoms.ts";
import { streamReindexMaterial } from "../../domain/materials/stream.ts";
import { validateQueueAddition, type QueueRejectionReason } from "../../domain/materials/upload-queue.ts";
import { describeFailure } from "../../lib/user-feedback.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";
import { StatusNotice } from "../ui/StatusNotice.tsx";
import { hasActiveWork, UploadQueue, type FileUploadState, type StagedFile } from "./UploadQueue.tsx";

// Un rechazo de `validateQueueAddition` en texto para la persona (decisión 6: el límite se aplica a
// toda la cola visible, no solo al lote suelto). Prioriza el techo de materiales sobre el nombre
// repetido porque es el motivo que de verdad bloquea; el nombre repetido es más fácil de resolver a
// mano quitando un fichero.
const describeQueueRejection = (reasons: readonly QueueRejectionReason[]): { readonly title: string; readonly description: string } => {
  const overCeiling = reasons.find(
    (reason): reason is Extract<QueueRejectionReason, { type: "not-enough-material-slots" }> =>
      reason.type === "not-enough-material-slots"
  );
  if (overCeiling !== undefined) {
    const slotsAvailable = Math.max(0, overCeiling.ceiling - overCeiling.existingMaterials - overCeiling.staged);
    return {
      title: `No caben ${overCeiling.received} fichero${overCeiling.received === 1 ? "" : "s"} más`,
      description: `Recibidos: ${overCeiling.received}. Ya en la cola o subidos: ${overCeiling.staged + overCeiling.existingMaterials}. Plazas libres: ${slotsAvailable} de un máximo de ${overCeiling.ceiling} materiales.`
    };
  }

  const duplicateNames = reasons
    .filter((reason): reason is Extract<QueueRejectionReason, { type: "duplicate-name" }> => reason.type === "duplicate-name")
    .map((reason) => reason.fileName);
  return {
    title: duplicateNames.length === 1 ? "Ese nombre ya está en la cola" : "Esos nombres ya están en la cola",
    description: `"${duplicateNames.join('", "')}" ya está a la espera de subirse. Quítalo de la lista o cambia el nombre antes de volver a intentarlo.`
  };
};

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
  const [queueRejection, setQueueRejection] = useState<{ readonly title: string; readonly description: string } | null>(null);
  const validate = useAtomSet(validateMaterialsAction, { mode: "promise" });
  const upload = useAtomSet(uploadMaterialsAction, { mode: "promise" });
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const refreshArtifacts = useAtomRefresh(artifactsQuery);

  // El techo se aplica a toda la cola visible (decisión 6), no solo a la petición HTTP: se necesita
  // saber cuántos materiales existen YA en el servidor. Solo se cuenta con la consulta en éxito; si
  // todavía está cargando o falló, no se bloquea al usuario aquí (el servidor sigue siendo la red de
  // seguridad final al subir de verdad).
  const materials = useAtomValue(materialsQuery);
  const remainingMaterials = AsyncResult.isSuccess(materials)
    ? Math.max(0, LIMITS.maxMaterials - materials.value.materials.length)
    : undefined;
  const existingMaterials = AsyncResult.isSuccess(materials) ? materials.value.materials.length : 0;
  const noSlotsLeft = remainingMaterials === 0;

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

    // La cola acumulada se valida ANTES de tocar `staged` (decisión 6): un rechazo deja intacto lo
    // que ya había, nunca se recortan en silencio los primeros que sí cabían.
    const rejectionReasons = validateQueueAddition({
      existingMaterials,
      stagedNames: staged.map((item) => item.file.name),
      incomingNames: files.map((file) => file.name)
    });
    if (rejectionReasons.length > 0) {
      setQueueRejection(describeQueueRejection(rejectionReasons));
      return;
    }
    setQueueRejection(null);

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

  // Al llegar a `maxMaterials` desaparece la capacidad de subir (decisión 16): sin trabajo activo no
  // se renderiza ningún botón; con trabajo activo, solo queda un control de progreso sin input.
  if (noSlotsLeft && !activeWork) {
    return null;
  }

  return (
    <>
      <ActionButton
        icon="upload"
        variant="neutral"
        onClick={() => setOpen(true)}
        className="relative w-full"
      >
        {noSlotsLeft ? "Ver progreso de preparación" : "Subir material"}
        {activeWork && (
          <span className="-translate-y-1/2 absolute top-1/2 right-3 size-2 rounded-full bg-brand" aria-hidden="true" />
        )}
      </ActionButton>

      <Dialog open={open} onClose={() => setOpen(false)} title="Subir material" widthClassName="max-w-md">
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-heading text-lg">Subir material</h2>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-8 place-items-center rounded-sm text-muted transition hover:bg-surface-muted hover:text-heading active:scale-90">
              <Icon name="close" size={18} />
            </button>
          </div>

          {queueRejection !== null && (
            <div className="mb-3">
              <StatusNotice tone="warning" title={queueRejection.title} description={queueRejection.description} />
            </div>
          )}

          {noSlotsLeft ? (
            // Plazas agotadas mientras el diálogo ya estaba abierto (decisión final de 4.2.2): la
            // cola de esta sesión se conserva (no se toca `staged`/`uploads`), solo desaparece la
            // entrada de ficheros nuevos.
            <StatusNotice
              tone="info"
              title={`Has alcanzado el máximo de ${LIMITS.maxMaterials} materiales.`}
              description="Borra uno para subir otro."
            />
          ) : (
            <div
              className={`border-2 border-dashed p-4 text-center transition ${
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
          )}

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

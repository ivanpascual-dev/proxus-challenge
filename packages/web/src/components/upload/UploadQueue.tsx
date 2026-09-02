import type { ProgressLine } from "../../domain/progress/progress-line.ts";
import { IconButton } from "../ui/IconButton.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";
import { GenerationProgress } from "../ui/GenerationProgress.tsx";

// Presentación de la cola de subida (fase 5, §4.2): `UploadManager` posee el estado, este componente
// solo lo pinta. Dos listas separadas porque son dos fases distintas: la de prevalidación (antes de
// escribir nada) y la de la cadena real (upload -> indexado -> apuntes) una vez confirmada.

export type UploadStage = "uploading" | "indexing" | "generating-notes" | "done" | "rejected" | "error";

export interface FileUploadState {
  readonly key: string;
  readonly fileName: string;
  readonly stage: UploadStage;
  // `message` queda reservado para fallos y rechazos, que siguen enseñando su texto entero (§11.3).
  // El avance de la fase en curso viaja en `progress`, ya derivado del evento.
  readonly message?: string | undefined;
  readonly progress?: ProgressLine | null | undefined;
}

// El mapa mental no es un paso propio de la cadena: sale del mismo índice que arma esta fase, así
// que la etiqueta lo nombra a los dos en vez de fingir un paso que no existe.
export const STAGE_LABEL: Record<UploadStage, string> = {
  uploading: "Subiendo…",
  indexing: "Analizando el documento (índice y mapa mental)…",
  "generating-notes": "Generando apuntes…",
  done: "Listo",
  rejected: "Rechazado",
  error: "Error"
};

export type StagedStatus = "validating" | "valid" | "rejected";

export interface StagedFile {
  readonly key: string;
  readonly file: File;
  readonly status: StagedStatus;
  readonly message?: string | undefined;
}

interface UploadQueueProps {
  readonly staged: readonly StagedFile[];
  readonly uploads: readonly FileUploadState[];
  readonly canUpload: boolean;
  readonly anyValidating: boolean;
  readonly onRemoveStaged: (key: string) => void;
  readonly onUpload: () => void;
}

export function UploadQueue({ staged, uploads, canUpload, anyValidating, onRemoveStaged, onUpload }: UploadQueueProps) {
  return (
    <>
      {staged.length > 0 && (
        <div className="mt-3">
          <ul className="grid gap-2">
            {staged.map((item) => (
              // `min-w-0`: la celda de un grid tampoco encoge por debajo de su contenido, así que
              // sin esto el `truncate` del nombre no llegaba a actuar y la fila ensanchaba el
              // diálogo entero hasta sacarle scroll horizontal.
              <li
                key={item.key}
                className={`min-w-0 border p-3 text-sm ${
                  item.status === "rejected"
                    ? "border-danger/40 bg-danger/10"
                    : item.status === "valid"
                    ? "border-success/40 bg-success/10"
                    : "border-border bg-surface"
                }`}
              >
                {/* `truncate` no recorta nada dentro de un flex sin `min-w-0`: el `min-width: auto`
                    por defecto impide que el elemento encoja por debajo de su contenido, así que un
                    nombre de fichero largo empujaba la caja y sacaba scroll horizontal en el
                    diálogo. El grupo de la derecha lleva `shrink-0` para que quien ceda sea el
                    nombre, que es lo que sabe recortarse. */}
                <div className="flex items-center justify-between gap-2">
                  <strong className="min-w-0 truncate text-heading">{item.file.name}</strong>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={item.status === "rejected" ? "text-danger-ink" : "text-muted"}>
                      {item.status === "validating" ? "Comprobando…" : item.status === "valid" ? "Listo para subir" : "Rechazado"}
                    </span>
                    <IconButton icon="close" label={`Quitar ${item.file.name} de la lista`} size={16} onClick={() => onRemoveStaged(item.key)} />
                  </div>
                </div>
                {item.message !== undefined && <p className="mt-1 break-words text-danger-ink">{item.message}</p>}
              </li>
            ))}
          </ul>
          <ActionButton
            icon="upload"
            variant="primary"
            disabled={!canUpload}
            onClick={onUpload}
            className="mt-3 w-full"
          >
            {canUpload
              ? `Subir ${staged.length} fichero${staged.length === 1 ? "" : "s"}`
              : anyValidating
              ? "Comprobando los ficheros…"
              : "Quita los ficheros rechazados para poder subir"}
          </ActionButton>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {uploads.map((item) => (
            <li
              key={item.key}
              className={`min-w-0 rounded-[10px] border p-3 text-sm ${
                item.stage === "error" || item.stage === "rejected"
                  ? "border-danger/40 bg-danger/10"
                  : item.stage === "done"
                  ? "border-success/40 bg-success/10"
                  : "border-border bg-surface"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="min-w-0 truncate text-heading">{item.fileName}</strong>
                <span
                  className={`shrink-0 ${
                    item.stage === "error" || item.stage === "rejected"
                      ? "text-danger-ink"
                      : item.stage === "done"
                      ? "text-success-ink"
                      : "text-muted"
                  }`}
                >
                  {STAGE_LABEL[item.stage]}
                </span>
              </div>
              {item.message !== undefined && (
                <p
                  className={
                    item.stage === "error" || item.stage === "rejected"
                      ? "mt-1 break-words text-danger-ink"
                      : "mt-1 break-words text-muted"
                  }
                >
                  {item.message}
                </p>
              )}
              {/* El fallo manda sobre el progreso (F5-46): con un error, la línea viva ya viene a
                  `null` desde `UploadManager` y solo queda el texto del fallo. */}
              {item.progress !== undefined && item.progress !== null && (
                <GenerationProgress line={item.progress} className="mt-2" />
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export const hasActiveWork = (staged: readonly StagedFile[], uploads: readonly FileUploadState[]): boolean =>
  staged.length > 0 || uploads.some((item) => item.stage !== "done" && item.stage !== "error" && item.stage !== "rejected");

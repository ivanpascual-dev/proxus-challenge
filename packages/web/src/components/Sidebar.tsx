import { useState } from "react";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { artifactsQuery } from "../domain/artifacts/atoms.ts";
import { deleteMaterialAction, materialsQuery } from "../domain/materials/atoms.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { UploadDropzone } from "./UploadDropzone.tsx";
import { DEFECT_MESSAGE, describeFailure } from "../lib/user-feedback.ts";

interface SidebarProps {
  readonly selectedMaterialId: string | null;
  readonly onSelectMaterial: (materialId: string) => void;
}

export function Sidebar({ selectedMaterialId, onSelectMaterial }: SidebarProps) {
  const materials = useAtomValue(materialsQuery);
  const deleteMaterial = useAtomSet(deleteMaterialAction, { mode: "promise" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ readonly materialId: string; readonly message: string } | null>(null);

  const onDelete = async (materialId: string, title: string) => {
    if (deletingId !== null) {
      return;
    }
    if (
      !window.confirm(
        `¿Borrar "${title}"? Se pierden también su apunte, sus controles y sus exámenes con sus intentos. No se puede deshacer.`
      )
    ) {
      return;
    }
    setDeletingId(materialId);
    setDeleteError(null);
    try {
      await deleteMaterial(materialId);
    } catch (cause) {
      const notice = describeFailure(cause, { area: "materials", action: "delete" }, "Sidebar");
      setDeleteError({ materialId, message: notice.description ?? notice.title });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="h-screen overflow-y-auto border-border border-r bg-canvas p-5 max-md:h-auto max-md:max-h-[45vh] max-md:border-r-0 max-md:border-b">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-strong font-extrabold text-on-brand">
            P
          </div>
          <div>
            <strong className="block text-heading">Proxus Tutor</strong>
            <span className="block text-muted text-sm">Asistente académico</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <UploadDropzone />

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-body text-sm uppercase tracking-widest">Materiales</h2>
        </div>
        {AsyncResult.matchWithError(materials, {
          onInitial: () => <p className="text-muted">Cargando materiales…</p>,
          onError: (error) => {
            const notice = describeFailure(error, { area: "materials", action: "list" }, "Sidebar");
            return <p className="text-danger-ink">{notice.title} {notice.description}</p>;
          },
          onDefect: (defect) => <p className="text-danger-ink">{DEFECT_MESSAGE}</p>,
          onSuccess: ({ value }) => value.materials.length === 0
            ? <p className="text-muted">Aún no hay PDFs subidos.</p>
            : (
                <details className="rounded-2xl border border-border bg-surface" open>
                  <summary className="cursor-pointer px-4 py-3 font-medium text-heading marker:text-brand">
                    {value.materials.length} {value.materials.length === 1 ? "material" : "materiales"}
                  </summary>
                  <ul className="grid gap-2 border-border border-t p-3">
                    {value.materials.map((material) => (
                      <li key={material.id} className="relative">
                        <button
                          type="button"
                          onClick={() => onSelectMaterial(material.id)}
                          className={`w-full rounded-xl p-3 pr-10 text-left transition hover:border-brand hover:bg-canvas ${
                            selectedMaterialId === material.id
                              ? "border border-brand bg-brand-soft"
                              : "border border-transparent bg-canvas/70"
                          }`}
                        >
                          <strong className="block text-heading">{material.title}</strong>
                          <span className="mt-1 flex items-center gap-2 text-muted text-sm">
                            <span>{material.pageCount} {material.pageCount === 1 ? "página" : "páginas"}</span>
                            <span
                              className={material.indexState === "indexed"
                                ? "rounded-full bg-success/15 px-2 py-0.5 text-[0.7rem] text-success-ink"
                                : "rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink"}
                            >
                              {material.indexState === "indexed" ? "indexado" : "sin indexar"}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          title={`Borrar "${material.title}"`}
                          aria-label={`Borrar "${material.title}"`}
                          onClick={() => void onDelete(material.id, material.title)}
                          disabled={deletingId !== null}
                          className="absolute top-3 right-3 rounded-full p-1 text-muted transition hover:bg-danger/10 hover:text-danger-ink disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingId === material.id ? "…" : "✕"}
                        </button>
                        {deleteError !== null && deleteError.materialId === material.id && (
                          <p className="mt-1 rounded-lg border border-danger/40 bg-danger/10 p-2 text-danger-ink text-xs">
                            No se pudo borrar: {deleteError.message}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )
        })}
      </section>

      {/* Los apuntes viven dentro de su material (fase 2, decisión 18) y los Controles y Exámenes en su
          pestaña "Pruebas" (fase 3, decisión 15): la barra lateral solo lista materiales. Lo único que
          queda de artefactos aquí es el aviso de ficheros que no se pudieron leer (invariante 3). */}
      <UnreadableArtifacts />
    </aside>
  );
}

// El aviso de ficheros de artefacto ilegibles no depende del tipo: el servidor los devuelve todos en
// `unreadable` (fase 2, invariante 3: se nombra el fichero que falla, no se calla).
function UnreadableArtifacts() {
  const artifacts = useAtomValue(artifactsQuery);

  return AsyncResult.matchWithError(artifacts, {
    onInitial: () => null,
    onError: () => null,
    onDefect: () => null,
    onSuccess: ({ value }) => value.unreadable.length === 0
      ? null
      : (
          <div className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-semibold text-warning-ink">
              {value.unreadable.length} {value.unreadable.length === 1 ? "fichero de artefacto no se pudo leer:" : "ficheros de artefacto no se pudieron leer:"}
            </p>
            <ul className="mt-1 grid gap-1 text-warning-ink">
              {value.unreadable.map((file) => (
                <li key={file.fileName}>
                  <code>{file.fileName}</code>: {file.reason}
                </li>
              ))}
            </ul>
          </div>
        )
  });
}

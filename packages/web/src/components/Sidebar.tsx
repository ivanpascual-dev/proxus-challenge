import { useState } from "react";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { deleteMaterialAction, materialsQuery } from "../domain/materials/atoms.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { UploadManager } from "./upload/UploadManager.tsx";
import { Icon } from "./ui/Icon.tsx";
import { IconButton } from "./ui/IconButton.tsx";
import { DEFECT_MESSAGE, describeFailure } from "../lib/user-feedback.ts";

interface SidebarProps {
  readonly selectedMaterialId: string | null;
  readonly onSelectMaterial: (materialId: string) => void;
}

// Reescrito visualmente (fase 5, §4.2): 224px fijos, sin `details` contenedor ni tarjeta por fila,
// sin renderizar `materialsQuery` de otra forma. Los apuntes viven dentro de su material (fase 2,
// decisión 18) y Controles/Exámenes en su pestaña "Pruebas" (fase 3, decisión 15): el sidebar solo
// lista materiales. El aviso de artefactos ilegibles vive ahora en `SystemNoticeRegion`, no aquí.
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
    <div className="grid h-screen grid-rows-[48px_auto_1fr_auto]">
      <header className="flex items-center border-border border-b px-4">
        <strong className="text-heading">Symma</strong>
      </header>

      <div className="border-border border-b p-3">
        <UploadManager />
      </div>

      <div className="min-h-0 overflow-y-auto p-2">
        {AsyncResult.matchWithError(materials, {
          onInitial: () => <p className="p-2 text-muted text-sm">Cargando materiales…</p>,
          onError: (error) => {
            const notice = describeFailure(error, { area: "materials", action: "list" }, "Sidebar");
            return <p className="p-2 text-danger-ink text-sm">{notice.title} {notice.description}</p>;
          },
          onDefect: () => <p className="p-2 text-danger-ink text-sm">{DEFECT_MESSAGE}</p>,
          onSuccess: ({ value }) => value.materials.length === 0
            ? <p className="p-2 text-muted text-sm">Aún no hay PDFs subidos.</p>
            : (
                <ul className="grid gap-0.5">
                  {value.materials.map((material) => {
                    const selected = selectedMaterialId === material.id;
                    return (
                      <li key={material.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelectMaterial(material.id)}
                          className={`w-full rounded-[8px] py-2 pr-8 pl-3 text-left transition ${
                            selected ? "bg-brand-soft" : "hover:bg-surface-muted"
                          }`}
                          style={selected ? { boxShadow: "inset 2px 0 0 var(--color-brand)" } : undefined}
                        >
                          <span className="line-clamp-2 block text-heading text-sm">{material.title}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-muted text-xs">
                            <Icon
                              name={material.indexState === "indexed" ? "check-circle" : "warning"}
                              size={16}
                              className={material.indexState === "indexed" ? "text-success-ink" : "text-warning-ink"}
                            />
                            {material.pageCount} {material.pageCount === 1 ? "página" : "páginas"}
                          </span>
                        </button>
                        <div className="absolute top-1.5 right-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                          <IconButton
                            icon="trash"
                            label={`Borrar "${material.title}"`}
                            onClick={() => void onDelete(material.id, material.title)}
                            disabled={deletingId !== null}
                          />
                        </div>
                        {deleteError !== null && deleteError.materialId === material.id && (
                          <p className="mt-1 rounded-lg border border-danger/40 bg-danger/10 p-2 text-danger-ink text-xs">
                            {deleteError.message}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
        })}
      </div>

      <footer className="flex items-center justify-center border-border border-t p-2">
        <ThemeToggle />
      </footer>
    </div>
  );
}

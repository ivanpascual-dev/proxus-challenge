import { useAtomValue } from "@effect/atom-react";
import type { ArtifactKind } from "@proxus/shared";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { artifactsByKindQuery } from "../domain/artifacts/atoms.ts";
import { materialsQuery } from "../domain/materials/atoms.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

interface SidebarProps {
  readonly selectedArtifactId: string | null;
  readonly selectedMaterialId: string | null;
  readonly onSelectArtifact: (artifactId: string) => void;
  readonly onSelectMaterial: (materialId: string) => void;
}

export function Sidebar({ selectedArtifactId, selectedMaterialId, onSelectArtifact, onSelectMaterial }: SidebarProps) {
  const materials = useAtomValue(materialsQuery);

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

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-body text-sm uppercase tracking-widest">Materiales</h2>
        </div>
        {AsyncResult.matchWithError(materials, {
          onInitial: () => <p className="text-muted">Cargando materiales…</p>,
          onError: (error) => <p className="text-danger-ink">{String(error)}</p>,
          onDefect: (defect) => <p className="text-danger-ink">{String(defect)}</p>,
          onSuccess: ({ value }) => value.materials.length === 0
            ? <p className="text-muted">Aún no hay PDFs subidos.</p>
            : (
                <details className="rounded-2xl border border-border bg-surface">
                  <summary className="cursor-pointer px-4 py-3 font-medium text-heading marker:text-brand">
                    {value.materials.length} {value.materials.length === 1 ? "material" : "materiales"}
                  </summary>
                  <ul className="grid gap-2 border-border border-t p-3">
                    {value.materials.map((material) => (
                      <li key={material.id}>
                        <button
                          type="button"
                          onClick={() => onSelectMaterial(material.id)}
                          className={`w-full rounded-xl p-3 text-left transition hover:border-brand hover:bg-canvas ${
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
                      </li>
                    ))}
                  </ul>
                </details>
              )
        })}
      </section>

      {/* Los apuntes viven dentro de su material (fase 2, decisión 18): la barra lateral solo lista
          quiz y test, y cada tipo va en su propia sección (paso 29 del plan). */}
      <ArtifactKindSection
        kind="quiz"
        title="Quizzes"
        emptyLabel="Aún no hay quizzes."
        selectedArtifactId={selectedArtifactId}
        onSelectArtifact={onSelectArtifact}
      />
      <ArtifactKindSection
        kind="test"
        title="Tests"
        emptyLabel="Aún no hay tests."
        selectedArtifactId={selectedArtifactId}
        onSelectArtifact={onSelectArtifact}
      />
      <UnreadableArtifacts />
    </aside>
  );
}

function ArtifactKindSection({
  kind,
  title,
  emptyLabel,
  selectedArtifactId,
  onSelectArtifact
}: {
  readonly kind: ArtifactKind;
  readonly title: string;
  readonly emptyLabel: string;
  readonly selectedArtifactId: string | null;
  readonly onSelectArtifact: (artifactId: string) => void;
}) {
  const artifacts = useAtomValue(artifactsByKindQuery(kind));

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-body text-sm uppercase tracking-widest">{title}</h2>
      </div>
      {AsyncResult.matchWithError(artifacts, {
        onInitial: () => <p className="text-muted">Cargando…</p>,
        onError: (error) => <p className="text-danger-ink">{String(error)}</p>,
        onDefect: (defect) => <p className="text-danger-ink">{String(defect)}</p>,
        onSuccess: ({ value }) => value.artifacts.length === 0
          ? <p className="text-muted">{emptyLabel}</p>
          : (
              <details className="rounded-2xl border border-border bg-surface">
                <summary className="cursor-pointer px-4 py-3 font-medium text-heading marker:text-brand">
                  {value.artifacts.length} {value.artifacts.length === 1 ? "artefacto" : "artefactos"}
                </summary>
                <ul className="grid gap-2 border-border border-t p-3">
                  {value.artifacts.map((artifact) => (
                    <li key={artifact.id}>
                      <button
                        className={`w-full rounded-xl p-3 text-left transition hover:border-brand hover:bg-canvas ${
                          selectedArtifactId === artifact.id
                            ? "border border-brand bg-brand-soft"
                            : "border border-transparent bg-canvas/70"
                        }`}
                        type="button"
                        onClick={() => onSelectArtifact(artifact.id)}
                      >
                        <strong className="block text-heading">{artifact.title}</strong>
                        <span className="mt-1 block text-muted text-sm">{artifact.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )
      })}
    </section>
  );
}

// El listado de artefactos ilegibles no depende del tipo: el servidor lo devuelve igual con `?kind=`
// (fase 2, invariante 3: se nombra el fichero que falla, no se calla). Se lee de una consulta ya viva.
function UnreadableArtifacts() {
  const artifacts = useAtomValue(artifactsByKindQuery("quiz"));

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

import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { artifactsQuery } from "../domain/artifacts/atoms.ts";
import { materialsQuery } from "../domain/materials/atoms.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";

interface SidebarProps {
  readonly selectedArtifactId: string | null;
  readonly onSelectArtifact: (artifactId: string) => void;
}

export function Sidebar({ selectedArtifactId, onSelectArtifact }: SidebarProps) {
  const materials = useAtomValue(materialsQuery);
  const artifacts = useAtomValue(artifactsQuery);

  return (
    <aside className="h-screen overflow-y-auto border-border border-r bg-canvas p-5 max-md:h-auto max-md:max-h-[45vh] max-md:border-r-0 max-md:border-b">
      <div className="mb-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-strong font-extrabold text-on-brand">
            P
          </div>
          <div>
            <strong className="block text-heading">Proxus Tutor</strong>
            <span className="block text-muted text-sm">Academic assistant</span>
          </div>
        </div>
        <ThemeToggle />
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-body text-sm uppercase tracking-widest">Materials</h2>
        </div>
        {AsyncResult.matchWithError(materials, {
          onInitial: () => <p className="text-muted">Loading materials…</p>,
          onError: (error) => <p className="text-danger-ink">{String(error)}</p>,
          onDefect: (defect) => <p className="text-danger-ink">{String(defect)}</p>,
          onSuccess: ({ value }) => value.materials.length === 0
            ? <p className="text-muted">No uploaded PDFs yet.</p>
            : (
                <details className="rounded-2xl border border-border bg-surface">
                  <summary className="cursor-pointer px-4 py-3 font-medium text-heading marker:text-brand">
                    {value.materials.length} material{value.materials.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="grid gap-2 border-border border-t p-3">
                    {value.materials.map((material) => (
                      <li className="rounded-xl bg-canvas/70 p-3" key={material.id}>
                        <strong className="block text-heading">{material.title}</strong>
                        <span className="mt-1 block text-muted text-sm">{material.pageCount} pages · {material.fileName}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )
        })}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="font-semibold text-body text-sm uppercase tracking-widest">Artifacts</h2>
        </div>
        {AsyncResult.matchWithError(artifacts, {
          onInitial: () => <p className="text-muted">Loading artifacts…</p>,
          onError: (error) => <p className="text-danger-ink">{String(error)}</p>,
          onDefect: (defect) => <p className="text-danger-ink">{String(defect)}</p>,
          onSuccess: ({ value }) => value.artifacts.length === 0
            ? <p className="text-muted">No notes, quizzes, or tests yet.</p>
            : (
                <details className="rounded-2xl border border-border bg-surface">
                  <summary className="cursor-pointer px-4 py-3 font-medium text-heading marker:text-brand">
                    {value.artifacts.length} artifact{value.artifacts.length === 1 ? "" : "s"}
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
                          <span className="mt-1 block text-muted text-sm">{artifact.kind} · {artifact.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )
        })}
      </section>
    </aside>
  );
}

import type { MaterialSurface } from "@proxus/shared";

// Las pestañas del material son exactamente las superficies del contrato de contexto (§5.2): si
// alguna vez se añade una quinta pestaña, el typecheck obliga a declararla también ahí, en vez de
// dejar a Sym sin saber nombrar dónde está el alumno.
export type Tab = MaterialSurface;

const TABS: ReadonlyArray<{ readonly value: Tab; readonly label: string }> = [
  { value: "pdf", label: "PDF" },
  { value: "mindmap", label: "Mapa mental" },
  { value: "notes", label: "Apuntes" },
  { value: "assessments", label: "Pruebas" }
];

// Subrayado y texto, no cuatro píldoras (fase 5, §4.5, decisión 14). Las cuatro pestañas del material
// no cambian de comportamiento aquí: siguen siendo estado local de `MaterialPanel`.
export function MaterialTabs({ active, onChange }: { readonly active: Tab; readonly onChange: (tab: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Secciones del material" className="flex shrink-0 gap-5 border-border border-b px-4">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={active === tab.value}
          onClick={() => onChange(tab.value)}
          className={`-mb-px border-b-2 px-1 py-2.5 font-medium text-sm transition ${
            active === tab.value ? "border-brand text-heading" : "border-transparent text-muted hover:text-heading"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

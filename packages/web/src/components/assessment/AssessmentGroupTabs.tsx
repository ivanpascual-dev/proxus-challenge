export type AssessmentGroup = "controls" | "practiceExams" | "realExams";

const GROUPS: ReadonlyArray<{ readonly value: AssessmentGroup; readonly label: string }> = [
  { value: "controls", label: "Controles" },
  { value: "practiceExams", label: "Exámenes de prueba" },
  { value: "realExams", label: "Exámenes reales" }
];

// Pruebas se divide en tres grupos visuales (fase 5, decisión 20, §4.9): `De repaso` es una etiqueta
// dentro de cada grupo, no un cuarto tipo.
export function AssessmentGroupTabs({
  active,
  onChange,
  counts
}: {
  readonly active: AssessmentGroup;
  readonly onChange: (group: AssessmentGroup) => void;
  readonly counts: Record<AssessmentGroup, number>;
}) {
  return (
    <div role="tablist" aria-label="Grupos de pruebas" className="mb-4 flex shrink-0 flex-wrap gap-5 border-border border-b">
      {GROUPS.map((group) => (
        <button
          key={group.value}
          type="button"
          role="tab"
          aria-selected={active === group.value}
          onClick={() => onChange(group.value)}
          className={`-mb-px border-b-2 px-1 py-2.5 font-medium text-sm transition ${
            active === group.value ? "border-brand text-heading" : "border-transparent text-muted hover:text-heading"
          }`}
        >
          {group.label} <span className="text-muted text-xs">({counts[group.value]})</span>
        </button>
      ))}
    </div>
  );
}

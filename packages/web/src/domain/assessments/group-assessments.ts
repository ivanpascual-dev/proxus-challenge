import type { AssessmentListEntry } from "@proxus/shared";

// Separa la lista plana del servidor en los tres grupos visuales de Pruebas (fase 5, decisión 20,
// §4.1). El orden de origen se conserva dentro de cada grupo; `origin: "review"` viaja intacto en la
// entrada, como etiqueta dentro de su grupo, nunca como un cuarto tipo.
export interface GroupedAssessments {
  readonly controls: readonly AssessmentListEntry[];
  readonly practiceExams: readonly AssessmentListEntry[];
  readonly realExams: readonly AssessmentListEntry[];
}

export const groupAssessments = (entries: readonly AssessmentListEntry[]): GroupedAssessments => {
  const controls: AssessmentListEntry[] = [];
  const practiceExams: AssessmentListEntry[] = [];
  const realExams: AssessmentListEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === "quiz") {
      controls.push(entry);
    } else if (entry.mode === "exam") {
      realExams.push(entry);
    } else {
      practiceExams.push(entry);
    }
  }
  return { controls, practiceExams, realExams };
};

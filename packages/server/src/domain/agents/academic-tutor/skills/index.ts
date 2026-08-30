export { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
export { UseStudyAssessmentsSkill } from "./use-study-assessments.ts";
export { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

import { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
import { UseStudyAssessmentsSkill } from "./use-study-assessments.ts";
import { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

export const AcademicTutorSkills = [
  UseUploadedMaterialsSkill,
  UseStudyAssessmentsSkill,
  ProposeNoteChangesSkill
] as const;

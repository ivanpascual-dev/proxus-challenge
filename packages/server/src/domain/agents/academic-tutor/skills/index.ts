export { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
export { UseStudyNotesSkill } from "./use-study-notes.ts";
export { ReadAssessmentsSkill } from "./read-assessments.ts";
export { ReviewProgressSkill } from "./review-progress.ts";
export { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

import { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
import { UseStudyNotesSkill } from "./use-study-notes.ts";
import { ReadAssessmentsSkill } from "./read-assessments.ts";
import { ReviewProgressSkill } from "./review-progress.ts";
import { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

export const AcademicTutorSkills = [
  UseUploadedMaterialsSkill,
  UseStudyNotesSkill,
  ReadAssessmentsSkill,
  ReviewProgressSkill,
  ProposeNoteChangesSkill
] as const;

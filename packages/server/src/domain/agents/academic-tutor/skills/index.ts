export { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
export { CreateStudyArtifactsSkill } from "./create-study-artifacts.ts";
export { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

import { UseUploadedMaterialsSkill } from "./use-uploaded-materials.ts";
import { CreateStudyArtifactsSkill } from "./create-study-artifacts.ts";
import { ProposeNoteChangesSkill } from "./propose-note-changes.ts";

export const AcademicTutorSkills = [
  UseUploadedMaterialsSkill,
  CreateStudyArtifactsSkill,
  ProposeNoteChangesSkill
] as const;

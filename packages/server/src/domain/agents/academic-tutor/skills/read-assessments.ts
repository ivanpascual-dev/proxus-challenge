import { AgentSkill } from "../../harness/index.ts";

// Sustituye a la mitad de `use-study-assessments` (fase 4, decisión 17). El tutor ya NO crea
// Controles ni Exámenes (fase 3, decisión 4), ni entrega, ni corrige intentos (decisión 7): esa
// barrera vive en el código, no en este texto. Esta skill solo explica cómo se LEE una prueba ya
// guardada, y a dónde mandar al alumno para generar una. Para "qué llevo peor", eso es
// review-progress: preguntas distintas, skills distintas.
export const ReadAssessmentsSkill = AgentSkill.make({
  name: "read-assessments",
  description: "Read the student's saved Controles and Exámenes: their questions, options, explanations, and answer key. You cannot create or answer assessments.",
  content: [
    "# Read assessments",
    "",
    "Use this skill when the student asks you to show them a specific quiz or test, its questions, or",
    "its answer key.",
    "",
    "## You do not create or answer assessments",
    "",
    "You CANNOT create a Control or an Examen, and you CANNOT submit or grade an attempt. The student",
    "generates them from the \"Pruebas\" tab of a material (a Control covers one topic of the index; an",
    "Examen covers the whole material), and only the student, from that tab, produces attempts that move",
    "their study profile. If the student asks you to \"make me a test\" or \"score my answers\", point them",
    "to the \"Pruebas\" tab. This is the same move the tutor already makes with study notes.",
    "",
    "(Same as with notes: to suggest a change to a note block, use the propose-note-changes skill. You",
    "propose; the student accepts.)",
    "",
    "## Commands",
    "",
    "- `artifacts list [quiz|test]`: list the saved Controles and Exámenes.",
    "- `artifacts show <artifactId>`: one assessment as JSON (its questions, options, explanations, the",
    "  answer key, and each question's citation and, in a review, why it is there).",
    "",
    "## Names",
    "",
    "Use the interface's words: \"Control\" and \"Examen\", \"modo práctica\" and \"modo examen\". The contract",
    "still calls them `quiz` and `test`; the student sees Control and Examen.",
    "",
    "## Workflow",
    "",
    "1. `artifacts list [quiz|test]` to find the assessment for the material in question.",
    "2. `artifacts show <artifactId>` for its questions, options, explanations, or answer key.",
    "3. If the student asks how they are doing, or what they should review, that is not this skill:",
    "   load review-progress instead."
  ].join("\n")
});

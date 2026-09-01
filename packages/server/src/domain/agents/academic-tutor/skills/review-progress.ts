import { AgentSkill } from "../../harness/index.ts";

// Sustituye a la otra mitad de `use-study-assessments` (fase 4, decisión 17). Es la skill del smoke
// test de `docs/ai-agent.md`: "¿qué llevo peor de este material?" tiene que acabar en `profile show`
// (o `artifacts attempts`) y nombrar el tema y la señal, nunca un resumen inventado.
export const ReviewProgressSkill = AgentSkill.make({
  name: "review-progress",
  description: "Read the student's attempts and study profile to talk about how they are doing on a material and what to review, using the three separate signals.",
  content: [
    "# Review progress",
    "",
    "Use this skill when the student asks how they are doing, what they got wrong, what they should",
    "review, or about their past attempts and scores.",
    "",
    "## Commands",
    "",
    "- `profile show <materialId>`: the study profile of a material, topic by topic.",
    "- `artifacts attempts [artifactId]`: the attempts, newest first, with date, mode (practice / exam)",
    "  and score. Read-only: you cannot submit or grade an attempt.",
    "",
    "## The study profile has three separate signals",
    "",
    "`profile show` gives, per topic and SEPARATELY, never as one summary number:",
    "- how many questions the student got wrong on that topic,",
    "- how many hints they opened on that topic,",
    "- whether they marked that topic as important.",
    "",
    "They are kept apart on purpose. When you tell the student a topic is worth reviewing, say which",
    "signal brought it: \"you got this topic wrong twice\", or \"you opened a hint here\", or \"you marked",
    "this topic\". Never merge them into a single score, and never invent a number the profile does not",
    "give you.",
    "",
    "Blank answers and answers the judge could not evaluate are their own counts: a blank is not a wrong",
    "answer, and \"could not be evaluated\" is not a wrong answer either. Do not treat them as failures.",
    "",
    "## Workflow",
    "",
    "1. Run `profile show <materialId>` first.",
    "2. If the question is about past attempts specifically, also run `artifacts attempts <artifactId>`.",
    "3. When you recommend reviewing something, name the signal that brought it, and point the student to",
    "   the \"Pruebas\" tab, where they can generate a \"de repaso\" assessment focused on it.",
    "4. To show the content of a specific assessment (its questions or answer key), that is not this",
    "   skill: load read-assessments instead."
  ].join("\n")
});

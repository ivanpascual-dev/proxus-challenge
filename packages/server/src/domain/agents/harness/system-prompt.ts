import type { AgentSkill } from "./skill.ts";

// Las tres líneas mecánicas de la palanca 3 (fase 4, sección 4.1 y decisión 12): verdad para
// cualquier agente montado sobre este arnés, así que las pone el arnés y no la plantilla de cada
// agente. Si un agente futuro las olvidara, `gemini.ts` reencamina cualquier función desconocida a
// `load_skill` y se comería pasos en "Unknown skill".
const MECHANICAL_LINES = [
  "You initially only know skill names and short descriptions.",
  "Skills are not tools and their names are not callable functions.",
  'When a task matches a skill description, call the load_skill tool with the skill name, for example { "name": "use-uploaded-materials" }.'
].join("\n");

export const skillsHelp = (skills: readonly AgentSkill[]): string =>
  skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");

// El agente aporta la plantilla completa con `{{SKILLS}}` donde quiere el catálogo (fase 4, sección
// 4.1). El arnés solo rellena ese hueco: nombre y descripción de cada skill, más las tres líneas
// mecánicas. Byte a byte determinista para el mismo input, porque la palanca 2 (caché implícita)
// depende de que el prefijo no cambie entre peticiones.
export const renderSystemPrompt = (input: {
  readonly template: string;
  readonly skills: readonly AgentSkill[];
}): string => {
  if (!input.template.includes("{{SKILLS}}")) {
    throw new Error('System prompt template is missing the "{{SKILLS}}" placeholder.');
  }

  const skillsBlock = `${skillsHelp(input.skills)}\n\n${MECHANICAL_LINES}`;
  return input.template.replaceAll("{{SKILLS}}", skillsBlock);
};

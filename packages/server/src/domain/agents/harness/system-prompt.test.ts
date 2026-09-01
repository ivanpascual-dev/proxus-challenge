import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSystemPrompt } from "./system-prompt.ts";
import { AgentSkill } from "./skill.ts";

const skills = [
  AgentSkill.make({ name: "use-uploaded-materials", description: "Read a material.", content: "..." }),
  AgentSkill.make({ name: "use-study-notes", description: "Read a study note.", content: "..." })
];

const template = "You are a tutor.\n\nSkills:\n{{SKILLS}}\n\nEnd.";

test("renderSystemPrompt: el mismo input produce byte a byte el mismo string", () => {
  const first = renderSystemPrompt({ template, skills });
  const second = renderSystemPrompt({ template, skills });
  assert.equal(first, second);
});

test("renderSystemPrompt: una plantilla sin {{SKILLS}} no construye", () => {
  assert.throws(() => renderSystemPrompt({ template: "Sin marcador.", skills }));
});

test("renderSystemPrompt: el bloque sustituido lleva una línea por skill y las tres líneas mecánicas", () => {
  const rendered = renderSystemPrompt({ template, skills });

  assert.match(rendered, /- use-uploaded-materials: Read a material\./);
  assert.match(rendered, /- use-study-notes: Read a study note\./);
  assert.match(rendered, /You initially only know skill names and short descriptions\./);
  assert.match(rendered, /Skills are not tools and their names are not callable functions\./);
  assert.match(rendered, /When a task matches a skill description, call the load_skill tool/);
});

test("renderSystemPrompt: sustituye todas las apariciones de {{SKILLS}}, si hay más de una", () => {
  const rendered = renderSystemPrompt({ template: "{{SKILLS}}\n---\n{{SKILLS}}", skills });
  const occurrences = rendered.split("- use-uploaded-materials").length - 1;
  assert.equal(occurrences, 2);
});

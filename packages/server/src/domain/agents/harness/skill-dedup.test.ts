import assert from "node:assert/strict";
import { test } from "node:test";
import { ALREADY_LOADED_NOTICE, dedupeSkillLoads } from "./skill-dedup.ts";
import { AgentMessage } from "./message.ts";

test("dedupeSkillLoads: dos cargas de la misma skill dejan un cuerpo y un puntero", () => {
  const messages = [
    AgentMessage.user("¿qué dice el material sobre grupos?"),
    AgentMessage.toolCall("load_skill", { name: "use-uploaded-materials" }),
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false),
    AgentMessage.assistant("un momento"),
    AgentMessage.toolCall("load_skill", { name: "use-uploaded-materials" }),
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false)
  ];

  const deduped = dedupeSkillLoads(messages);

  assert.equal(deduped.length, messages.length);
  assert.deepEqual(deduped[2], messages[2]);
  assert.deepEqual(deduped[5], AgentMessage.toolResult("load_skill", ALREADY_LOADED_NOTICE, false));
});

test("dedupeSkillLoads: dos skills distintas conservan los dos cuerpos", () => {
  const messages = [
    AgentMessage.toolCall("load_skill", { name: "use-uploaded-materials" }),
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false),
    AgentMessage.toolCall("load_skill", { name: "use-study-notes" }),
    AgentMessage.toolResult("load_skill", "# Use study notes\n...", false)
  ];

  const deduped = dedupeSkillLoads(messages);

  assert.deepEqual(deduped[1], messages[1]);
  assert.deepEqual(deduped[3], messages[3]);
});

test("dedupeSkillLoads: el orden de los mensajes no cambia nunca", () => {
  const messages = [
    AgentMessage.user("hola"),
    AgentMessage.toolCall("load_skill", { name: "use-uploaded-materials" }),
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false),
    AgentMessage.toolCall("cli", { input: "materials list" }),
    AgentMessage.toolResult("cli", { materials: [] }, false),
    AgentMessage.toolCall("load_skill", { name: "use-uploaded-materials" }),
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false),
    AgentMessage.assistant("listo")
  ];

  const deduped = dedupeSkillLoads(messages);

  assert.equal(deduped.length, messages.length);
  assert.deepEqual(deduped.map((message) => message.role), messages.map((message) => message.role));
  assert.deepEqual(deduped[0], messages[0]);
  assert.deepEqual(deduped[3], messages[3]);
  assert.deepEqual(deduped[4], messages[4]);
  assert.deepEqual(deduped[7], messages[7]);
});

test("dedupeSkillLoads: un tool-result de load_skill sin tool-call previo pasa intacto", () => {
  const messages = [
    AgentMessage.toolResult("load_skill", "# Use uploaded materials\n...", false)
  ];

  assert.deepEqual(dedupeSkillLoads(messages), messages);
});

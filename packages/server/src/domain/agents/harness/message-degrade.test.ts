import assert from "node:assert/strict";
import { test } from "node:test";
import { degradeHistory, degradeImages } from "./message-degrade.ts";
import { AgentMessage } from "./message.ts";

const material = {
  id: "algebra-notes",
  title: "Algebra notes",
  fileName: "algebra-notes.pdf",
  pageCount: 20,
  uploadedAt: "2026-08-01T00:00:00.000Z",
  indexState: "indexed" as const
};

const pageImagesResult = {
  type: "material-page-images" as const,
  material,
  pages: [
    { page: 10, mediaType: "image/png" as const, data: "base64-page-10" },
    { page: 11, mediaType: "image/png" as const, data: "base64-page-11" }
  ]
};

test("degradeImages: un tool-result con imágenes pierde el data y gana omitted", () => {
  const message = AgentMessage.toolResult("cli", pageImagesResult, false);
  const degraded = degradeImages(message);

  assert.equal(degraded.role, "tool-result");
  assert.deepEqual(degraded, AgentMessage.toolResult("cli", {
    type: "material-page-images",
    material,
    pages: [
      { page: 10, mediaType: "image/png" },
      { page: 11, mediaType: "image/png" }
    ],
    omitted: true
  }, false));
});

test("degradeImages: un tool-result sin imágenes no se toca", () => {
  const message = AgentMessage.toolResult("cli", { materials: [] }, false);
  assert.deepEqual(degradeImages(message), message);
});

test("degradeImages: degradar dos veces da el mismo objeto", () => {
  const message = AgentMessage.toolResult("cli", pageImagesResult, false);
  const once = degradeImages(message);
  const twice = degradeImages(once);
  assert.deepEqual(once, twice);
});

test("degradeImages: el resto de roles pasan intactos", () => {
  const user = AgentMessage.user("hola");
  const assistant = AgentMessage.assistant("hola de vuelta");
  const toolCall = AgentMessage.toolCall("cli", { input: "materials view algebra-notes 10" });

  assert.deepEqual(degradeImages(user), user);
  assert.deepEqual(degradeImages(assistant), assistant);
  assert.deepEqual(degradeImages(toolCall), toolCall);
});

test("degradeHistory: solo degrada los tool-result con imágenes, en el mismo orden", () => {
  const messages = [
    AgentMessage.user("muéstrame la página 10"),
    AgentMessage.toolCall("cli", { input: "materials view algebra-notes 10" }),
    AgentMessage.toolResult("cli", pageImagesResult, false),
    AgentMessage.assistant("aquí tienes la página 10")
  ];

  const degraded = degradeHistory(messages);

  assert.equal(degraded.length, 4);
  assert.deepEqual(degraded[0], messages[0]);
  assert.deepEqual(degraded[1], messages[1]);
  assert.deepEqual(degraded[3], messages[3]);
  assert.equal((degraded[2] as { readonly result: { readonly omitted?: boolean } }).result.omitted, true);
});

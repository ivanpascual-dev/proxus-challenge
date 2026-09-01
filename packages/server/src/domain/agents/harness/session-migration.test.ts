import assert from "node:assert/strict";
import { test } from "node:test";
import { Option } from "effect";
import type { AgentMessage } from "./message.ts";
import { migrateStoredTurns, stripScreenContext, toPresentationMessages, type RawStoredTurn } from "./session-migration.ts";

test("stripScreenContext: sin el sufijo canónico exacto conserva el texto tal cual", () => {
  assert.equal(stripScreenContext("Hola"), "Hola");
  assert.equal(stripScreenContext("Hola\n\n<<<BEGIN SCREEN CONTEXT>>>\nalgo"), "Hola\n\n<<<BEGIN SCREEN CONTEXT>>>\nalgo");
});

test("stripScreenContext: recorta solo el sufijo que escribió renderScreenContext", () => {
  const withSuffix = [
    "¿Puedes ver lo que tengo abierto?",
    "",
    "<<<BEGIN SCREEN CONTEXT>>>",
    "The student is currently looking at: material \"Fixture\" (id: fixture-material)",
    "These are pointers, not content. Read anything you need with a command.",
    "<<<END SCREEN CONTEXT>>>"
  ].join("\n");

  assert.equal(stripScreenContext(withSuffix), "¿Puedes ver lo que tengo abierto?");
});

const step = (index: number, toolCalls: RawStoredTurn["steps"][number]["toolCalls"] = []) => ({
  index,
  usage: { inputTokens: 100, outputTokens: 10 },
  toolCalls
});

test("migrateStoredTurns: un turno sin campos nuevos se completa a partir de la frontera de mensajes user", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" }
  ];
  const turns: readonly RawStoredTurn[] = [{ startedAt: "t0", steps: [step(0)] }];

  const migrated = migrateStoredTurns(messages, turns);
  assert.ok(Option.isSome(migrated));
  assert.deepEqual(migrated.value, [{
    startedAt: "t0",
    steps: [step(0)],
    input: "Hola",
    context: [],
    messageCount: 2,
    followUpQuestions: []
  }]);
});

test("migrateStoredTurns: un turno ya con el contrato nuevo se conserva sin reinterpretar", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola\n\n<<<BEGIN SCREEN CONTEXT>>>\nx\n<<<END SCREEN CONTEXT>>>" },
    { role: "assistant", content: "¡Hola!" }
  ];
  const turn: RawStoredTurn = {
    startedAt: "t0",
    steps: [step(0)],
    input: "Hola",
    context: [{ type: "material", materialId: "m1", title: "Material" }],
    messageCount: 2,
    followUpQuestions: ["¿Qué tema quieres ver?"]
  };

  const migrated = migrateStoredTurns(messages, [turn]);
  assert.ok(Option.isSome(migrated));
  assert.deepEqual(migrated.value[0], turn);
});

test("migrateStoredTurns: messageCount explícito que no coincide con la frontera real es una sesión corrupta", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" },
    { role: "user", content: "Otra pregunta" },
    { role: "assistant", content: "Respuesta" }
  ];
  const turns: readonly RawStoredTurn[] = [
    { startedAt: "t0", steps: [step(0)], messageCount: 3 }, // debería ser 2
    { startedAt: "t1", steps: [step(0)] }
  ];

  assert.ok(Option.isNone(migrateStoredTurns(messages, turns)));
});

test("migrateStoredTurns: el número de turnos no coincide con el número de mensajes user, no se adivina el corte", () => {
  const messages: readonly AgentMessage[] = [
    { role: "user", content: "Hola" },
    { role: "assistant", content: "¡Hola!" },
    { role: "user", content: "Otra" },
    { role: "assistant", content: "Respuesta" }
  ];
  const turns: readonly RawStoredTurn[] = [{ startedAt: "t0", steps: [step(0)] }];

  assert.ok(Option.isNone(migrateStoredTurns(messages, turns)));
});

// Fixture de regresión anonimizado (fase 5, §5.1): una sesión real observada donde el segundo turno
// concatena el bloque `SCREEN CONTEXT` al mensaje del alumno y la respuesta se cortó justo antes del
// cierre `<<<END FOLLOW-UP>>>` (el bug que arregló F4-29b). El contenido del material se sustituye por
// un placeholder; lo que importa para la regresión es la forma, no el temario real del alumno.
const regressionMessages: readonly AgentMessage[] = [
  { role: "user", content: "Hola" },
  {
    role: "assistant",
    content: "¡Hola! Soy tu tutor académico. Estoy aquí para ayudarte a estudiar tus materiales.\n\n¿En qué material o tema te gustaría trabajar hoy?"
  },
  {
    role: "user",
    content: [
      "¿Puedes ver lo que tengo abierto?",
      "",
      "<<<BEGIN SCREEN CONTEXT>>>",
      "The student is currently looking at: material \"Fixture Material\" (id: fixture-material), artifact \"Fixture Notes\" (id: fixture-artifact-1)",
      "These are pointers, not content. Read anything you need with a command.",
      "<<<END SCREEN CONTEXT>>>"
    ].join("\n")
  },
  { role: "tool-call", name: "load_skill", input: { name: "use-uploaded-materials" } },
  { role: "tool-result", name: "load_skill", result: "# Use uploaded materials\n\n(resumen de la skill)", isFailure: false },
  { role: "tool-call", name: "cli", input: { input: "materials read \"Fixture Material\" 1-20" } },
  { role: "tool-result", name: "cli", result: "(texto indexado del material, omitido en el fixture)", isFailure: false },
  {
    role: "assistant",
    content: [
      "Sí, he podido acceder al material que tienes abierto. Se trata del documento **\"Fixture Material\"**.",
      "",
      "¿Hay algún concepto específico sobre el que quieras profundizar?",
      "",
      "<<<FOLLOW-UP>>>",
      "1. ¿Te gustaría que te explique el primer concepto?",
      "2. ¿Quieres repasar el segundo modelo mencionado en el texto?",
      "3. ¿Necesitas ayuda para entender la distinción del tercer punto?"
    ].join("\n")
  }
];

const regressionTurns: readonly RawStoredTurn[] = [
  { startedAt: "2026-08-31T23:43:04.734Z", steps: [step(0)] },
  {
    startedAt: "2026-08-31T23:43:38.102Z",
    steps: [
      step(0, [{ name: "load_skill", input: { name: "use-uploaded-materials" } }]),
      step(1, [{ name: "cli", input: { input: "materials read \"Fixture Material\" 1-20" } }]),
      step(2)
    ]
  }
];

test("migrateStoredTurns: la sesión de regresión recupera input limpio, sin contexto reconstruido, y las tres preguntas sin cierre", () => {
  const migrated = migrateStoredTurns(regressionMessages, regressionTurns);
  assert.ok(Option.isSome(migrated));
  const [first, second] = migrated.value;

  assert.equal(first!.input, "Hola");
  assert.equal(first!.messageCount, 2);
  assert.deepEqual(first!.followUpQuestions, []);

  assert.equal(second!.input, "¿Puedes ver lo que tengo abierto?");
  assert.deepEqual(second!.context, []);
  assert.equal(second!.messageCount, 6);
  assert.deepEqual(second!.followUpQuestions, [
    "¿Te gustaría que te explique el primer concepto?",
    "¿Quieres repasar el segundo modelo mencionado en el texto?",
    "¿Necesitas ayuda para entender la distinción del tercer punto?"
  ]);
});

test("toPresentationMessages: la sesión de regresión no deja SCREEN CONTEXT, ids ni <<< visibles", () => {
  const migrated = migrateStoredTurns(regressionMessages, regressionTurns);
  assert.ok(Option.isSome(migrated));
  const presentation = toPresentationMessages(regressionMessages, migrated.value);

  const secondUserBubble = presentation[2];
  assert.ok(secondUserBubble?.role === "user");
  assert.equal(secondUserBubble.content, "¿Puedes ver lo que tengo abierto?");

  const lastAssistantBubble = presentation.at(-1);
  assert.ok(lastAssistantBubble?.role === "assistant");
  assert.ok(!lastAssistantBubble.content.includes("<<<"));
  assert.ok(!lastAssistantBubble.content.includes("FOLLOW-UP"));

  for (const message of presentation) {
    if (message.role === "user" || message.role === "assistant") {
      assert.ok(!message.content.includes("SCREEN CONTEXT"));
      assert.ok(!message.content.includes("id:"));
    }
  }

  // El historial que el modelo usó como contexto no se toca: sigue teniendo el bloque técnico.
  const originalSecondMessage = regressionMessages[2];
  assert.ok(originalSecondMessage?.role === "user");
  assert.ok(originalSecondMessage.content.includes("SCREEN CONTEXT"));
});

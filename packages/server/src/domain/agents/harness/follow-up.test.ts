import assert from "node:assert/strict";
import { test } from "node:test";
import { extractFollowUp } from "./follow-up.ts";

const wellFormedBlock = [
  "1. ¿Qué es un grupo abeliano?",
  "2. ¿Cómo se demuestra que Z es un grupo?",
  "3. ¿Qué diferencia hay entre grupo y anillo?"
].join("\n");

test("extractFollowUp: bloque bien formado separa el texto de las tres preguntas", () => {
  const text = `Los grupos son conjuntos con una operación.\n\n<<<FOLLOW-UP>>>\n${wellFormedBlock}\n<<<END FOLLOW-UP>>>`;

  const result = extractFollowUp(text);

  assert.equal(result.text, "Los grupos son conjuntos con una operación.");
  assert.deepEqual(result.questions, [
    "¿Qué es un grupo abeliano?",
    "¿Cómo se demuestra que Z es un grupo?",
    "¿Qué diferencia hay entre grupo y anillo?"
  ]);
});

test("extractFollowUp: bloque ausente devuelve el texto tal cual y sin preguntas", () => {
  const text = "Los grupos son conjuntos con una operación.";

  assert.deepEqual(extractFollowUp(text), { text, questions: [] });
});

test("extractFollowUp: bloque sin cerrar no se extrae", () => {
  const text = `Los grupos son conjuntos con una operación.\n\n<<<FOLLOW-UP>>>\n${wellFormedBlock}`;

  assert.deepEqual(extractFollowUp(text), { text, questions: [] });
});

test("extractFollowUp: dos preguntas en vez de tres no se extraen", () => {
  const shortBlock = [
    "1. ¿Qué es un grupo abeliano?",
    "2. ¿Cómo se demuestra que Z es un grupo?"
  ].join("\n");
  const text = `Los grupos son conjuntos con una operación.\n\n<<<FOLLOW-UP>>>\n${shortBlock}\n<<<END FOLLOW-UP>>>`;

  assert.deepEqual(extractFollowUp(text), { text, questions: [] });
});

test("extractFollowUp: una pregunta por encima del techo de caracteres no se extrae", () => {
  const tooLong = "¿".repeat(200);
  const block = [
    "1. ¿Qué es un grupo abeliano?",
    `2. ${tooLong}`,
    "3. ¿Qué diferencia hay entre grupo y anillo?"
  ].join("\n");
  const text = `Los grupos son conjuntos con una operación.\n\n<<<FOLLOW-UP>>>\n${block}\n<<<END FOLLOW-UP>>>`;

  assert.deepEqual(extractFollowUp(text), { text, questions: [] });
});

test("extractFollowUp: el delimitador dentro de un bloque de código sin cerrar no cuenta como bloque real", () => {
  // El fence ``` sigue abierto en la posición del bloque (número impar de ``` antes de él), así que
  // aunque el bloque quede anclado al final del texto, no es el bloque real de seguimiento.
  const text = [
    "El tutor termina cada respuesta con un bloque como este:",
    "",
    "```",
    "<<<FOLLOW-UP>>>",
    "1. pregunta",
    "2. pregunta",
    "3. pregunta",
    "<<<END FOLLOW-UP>>>"
  ].join("\n");

  assert.deepEqual(extractFollowUp(text), { text, questions: [] });
});

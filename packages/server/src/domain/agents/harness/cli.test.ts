import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect } from "effect";
import { tokenize } from "./cli.ts";

const run = (input: string) => Effect.runSync(tokenize(input));

test("tokenize: JSON entre comillas simples con comillas escapadas dentro llega intacto a JSON.parse", () => {
  const json = '{"rationale":"Ampliar \\"La influencia\\" del bloque","operation":{"type":"remove","blockId":"b1"}}';
  const tokens = run(`artifacts note propose id1 '${json}'`);
  assert.deepEqual(tokens.slice(0, 3), ["artifacts", "note", "propose"]);
  assert.equal(tokens[3], "id1");
  const parsed = JSON.parse(tokens[4] as string);
  assert.equal(parsed.rationale, 'Ampliar "La influencia" del bloque');
  assert.equal(parsed.operation.blockId, "b1");
});

test("tokenize: dentro de comillas simples la barra invertida es literal (markdown con \\n)", () => {
  const tokens = run("cmd '{\"markdown\":\"## Título\\nPárrafo\"}'");
  const parsed = JSON.parse(tokens[1] as string);
  assert.equal(parsed.markdown, "## Título\nPárrafo");
});

test("tokenize: las comillas dobles sí desescapan", () => {
  const tokens = run('say "hola \\"mundo\\""');
  assert.deepEqual(tokens, ["say", 'hola "mundo"']);
});

test("tokenize: JSON limpio entre comillas simples (artifacts note propose) no se toca", () => {
  const json = '{"rationale":"Falta un caso","operation":{"type":"remove","blockId":"b1"}}';
  const tokens = run(`artifacts note propose id1 '${json}'`);
  assert.equal(tokens[4], json);
  assert.deepEqual(JSON.parse(tokens[4] as string).operation.type, "remove");
});

test("tokenize: tokens sueltos y espacios", () => {
  assert.deepEqual(run("  materials view  m1   3-8 "), ["materials", "view", "m1", "3-8"]);
});

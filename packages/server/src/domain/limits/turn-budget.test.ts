import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import { planIndexRead, planRender, type TurnBudgetState } from "./turn-budget.ts";

const state = (over: Partial<TurnBudgetState> = {}): TurnBudgetState => ({
  pagesLeft: 20,
  bytesLeft: LIMITS.maxTurnImageBytes,
  indexCharactersLeft: LIMITS.maxIndexTextCharactersPerTurn,
  ...over
});

test("planRender serves everything when the budget is not exhausted", () => {
  const result = planRender(state({ pagesLeft: 5, bytesLeft: 1_000 }), [10, 10, 10]);
  assert.equal(result.served, 3);
  assert.equal(result.notice, null);
  assert.equal(result.nextState.pagesLeft, 2);
  assert.equal(result.nextState.bytesLeft, 970);
});

test("planRender stops when the page budget runs out", () => {
  const result = planRender(state({ pagesLeft: 2, bytesLeft: 1_000 }), [10, 10, 10]);
  assert.equal(result.served, 2);
  assert.match(result.notice ?? "", /página 2 de 3/);
  assert.match(result.notice ?? "", /páginas por turno/);
  assert.equal(result.nextState.pagesLeft, 0);
  assert.equal(result.nextState.bytesLeft, 980);
});

test("planRender stops mid-list when the byte budget runs out, naming the right page", () => {
  const result = planRender(state({ pagesLeft: 20, bytesLeft: 25 }), [10, 10, 10]);
  assert.equal(result.served, 2);
  assert.match(result.notice ?? "", /página 2 de 3/);
  assert.match(result.notice ?? "", /MB/);
  assert.equal(result.nextState.pagesLeft, 18);
  assert.equal(result.nextState.bytesLeft, 5);
});

test("planRender stops before serving anything when the first page does not fit", () => {
  const result = planRender(state({ pagesLeft: 20, bytesLeft: 5 }), [10]);
  assert.equal(result.served, 0);
  assert.match(result.notice ?? "", /página 0 de 1/);
  assert.equal(result.nextState.bytesLeft, 5);
});

test("planRender preserva el contador de texto indexado intacto", () => {
  const result = planRender(state(), [10, 10]);
  assert.equal(result.nextState.indexCharactersLeft, LIMITS.maxIndexTextCharactersPerTurn);
});

test("planIndexRead sirve todas las páginas cuando caben", () => {
  const result = planIndexRead(state({ indexCharactersLeft: 1_000 }), [
    { page: 3, characters: 300 },
    { page: 4, characters: 300 }
  ]);
  assert.equal(result.served, 2);
  assert.equal(result.lastServedPage, 4);
  assert.equal(result.notice, null);
  assert.equal(result.nextState.indexCharactersLeft, 400);
});

test("planIndexRead para en la última página que cabe y nombra página y total", () => {
  const result = planIndexRead(state({ indexCharactersLeft: 500 }), [
    { page: 3, characters: 300 },
    { page: 4, characters: 300 },
    { page: 5, characters: 300 }
  ]);
  assert.equal(result.served, 1);
  assert.equal(result.lastServedPage, 3);
  assert.match(result.notice ?? "", /page 3 of the 3 requested pages/);
  assert.equal(result.nextState.indexCharactersLeft, 200);
});

test("planIndexRead sin servir nada lo dice sin nombrar página", () => {
  const result = planIndexRead(state({ indexCharactersLeft: 100 }), [{ page: 3, characters: 300 }]);
  assert.equal(result.served, 0);
  assert.equal(result.lastServedPage, null);
  assert.match(result.notice ?? "", /any of the 1 requested pages/);
});

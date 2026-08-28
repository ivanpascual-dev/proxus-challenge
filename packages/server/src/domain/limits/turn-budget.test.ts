import assert from "node:assert/strict";
import { test } from "node:test";
import { planRender, type TurnBudgetState } from "./turn-budget.ts";

test("planRender serves everything when the budget is not exhausted", () => {
  const state: TurnBudgetState = { pagesLeft: 5, bytesLeft: 1_000 };
  const result = planRender(state, [10, 10, 10]);
  assert.equal(result.served, 3);
  assert.equal(result.notice, null);
  assert.deepEqual(result.nextState, { pagesLeft: 2, bytesLeft: 970 });
});

test("planRender stops when the page budget runs out", () => {
  const state: TurnBudgetState = { pagesLeft: 2, bytesLeft: 1_000 };
  const result = planRender(state, [10, 10, 10]);
  assert.equal(result.served, 2);
  assert.match(result.notice ?? "", /página 2 de 3/);
  assert.match(result.notice ?? "", /páginas por turno/);
  assert.deepEqual(result.nextState, { pagesLeft: 0, bytesLeft: 980 });
});

test("planRender stops mid-list when the byte budget runs out, naming the right page", () => {
  const state: TurnBudgetState = { pagesLeft: 20, bytesLeft: 25 };
  const result = planRender(state, [10, 10, 10]);
  assert.equal(result.served, 2);
  assert.match(result.notice ?? "", /página 2 de 3/);
  assert.match(result.notice ?? "", /MB/);
  assert.deepEqual(result.nextState, { pagesLeft: 18, bytesLeft: 5 });
});

test("planRender stops before serving anything when the first page does not fit", () => {
  const state: TurnBudgetState = { pagesLeft: 20, bytesLeft: 5 };
  const result = planRender(state, [10]);
  assert.equal(result.served, 0);
  assert.match(result.notice ?? "", /página 0 de 1/);
  assert.deepEqual(result.nextState, { pagesLeft: 20, bytesLeft: 5 });
});

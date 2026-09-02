import assert from "node:assert/strict";
import { test } from "node:test";
import { sortSessionsForHistory, type SessionOrderFields } from "./session-order.ts";

const session = (
  id: string,
  overrides: Partial<Omit<SessionOrderFields, "id">> = {}
): SessionOrderFields => ({
  id,
  turns: overrides.turns ?? [],
  createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z"
});

const withTurns = { turns: [{}] as readonly unknown[] };

const ids = (sessions: readonly SessionOrderFields[]): readonly string[] => sessions.map((s) => s.id);

test("las conversaciones con turnos van antes que las vacías, aunque la vacía sea más reciente", () => {
  const empty = session("empty", { updatedAt: "2026-05-01T00:00:00.000Z" });
  const spoken = session("spoken", { ...withTurns, updatedAt: "2026-01-01T00:00:00.000Z" });

  assert.deepEqual(ids(sortSessionsForHistory([empty, spoken])), ["spoken", "empty"]);
});

test("dentro del grupo con turnos ordena por updatedAt descendente", () => {
  const older = session("older", { ...withTurns, updatedAt: "2026-02-01T00:00:00.000Z" });
  const newer = session("newer", { ...withTurns, updatedAt: "2026-03-01T00:00:00.000Z" });

  assert.deepEqual(ids(sortSessionsForHistory([older, newer])), ["newer", "older"]);
});

test("empate de updatedAt: desempata por createdAt descendente", () => {
  const sameUpdated = "2026-03-01T00:00:00.000Z";
  const createdEarly = session("early", { ...withTurns, updatedAt: sameUpdated, createdAt: "2026-01-01T00:00:00.000Z" });
  const createdLate = session("late", { ...withTurns, updatedAt: sameUpdated, createdAt: "2026-02-01T00:00:00.000Z" });

  assert.deepEqual(ids(sortSessionsForHistory([createdEarly, createdLate])), ["late", "early"]);
});

test("fechas idénticas: desempate estable por id ascendente", () => {
  const marks = { ...withTurns, updatedAt: "2026-03-01T00:00:00.000Z", createdAt: "2026-03-01T00:00:00.000Z" };
  const b = session("b", marks);
  const a = session("a", marks);
  const c = session("c", marks);

  assert.deepEqual(ids(sortSessionsForHistory([b, a, c])), ["a", "b", "c"]);
  // El mismo conjunto en otro orden de entrada produce el mismo resultado.
  assert.deepEqual(ids(sortSessionsForHistory([c, b, a])), ["a", "b", "c"]);
});

test("las vacías heredadas conservan entre ellas el mismo orden interno", () => {
  const e1 = session("e1", { updatedAt: "2026-02-01T00:00:00.000Z" });
  const e2 = session("e2", { updatedAt: "2026-04-01T00:00:00.000Z" });
  const e3 = session("e3", { updatedAt: "2026-03-01T00:00:00.000Z" });

  assert.deepEqual(ids(sortSessionsForHistory([e1, e2, e3])), ["e2", "e3", "e1"]);
});

test("no muta el array recibido", () => {
  const input = [
    session("empty", { updatedAt: "2026-05-01T00:00:00.000Z" }),
    session("spoken", { ...withTurns })
  ];
  const snapshot = ids(input);
  sortSessionsForHistory(input);
  assert.deepEqual(ids(input), snapshot);
});

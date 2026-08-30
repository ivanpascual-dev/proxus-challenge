import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import type { InProgressAttempt } from "./artifact.ts";
import { applyHeartbeat, connectedSecondsNow, expire, isExpired, remainingSeconds } from "./exam-clock.ts";

const examAttempt = (overrides: Partial<InProgressAttempt> = {}): InProgressAttempt => ({
  id: "a1",
  artifactId: "test-1",
  artifactKind: "test",
  mode: "exam",
  status: "in-progress",
  startedAt: "2026-08-30T10:00:00.000Z",
  timeLimitSeconds: 600,
  hintsRevealed: [],
  answers: [],
  connectedSeconds: 0,
  lastHeartbeatAt: null,
  interruptions: [],
  ...overrides
});

test("un latido dentro del umbral suma el tramo entero al tiempo conectado", () => {
  const attempt = examAttempt({ connectedSeconds: 100, lastHeartbeatAt: "2026-08-30T10:05:00.000Z" });
  const step = applyHeartbeat(attempt, "2026-08-30T10:05:15.000Z");
  assert.equal(step.connectedSeconds, 115);
  assert.equal(step.lastHeartbeatAt, "2026-08-30T10:05:15.000Z");
  assert.deepEqual(step.interruptions, []);
});

test("el primer latido cuenta desde startedAt", () => {
  const attempt = examAttempt({ startedAt: "2026-08-30T10:00:00.000Z", lastHeartbeatAt: null });
  const step = applyHeartbeat(attempt, "2026-08-30T10:00:12.000Z");
  assert.equal(step.connectedSeconds, 12);
});

test("un hueco más largo que el umbral no cuenta y se guarda como interrupción", () => {
  const attempt = examAttempt({ connectedSeconds: 100, lastHeartbeatAt: "2026-08-30T10:05:00.000Z" });
  // 2 horas fuera: cerró la pestaña y volvió (decisión 19b).
  const step = applyHeartbeat(attempt, "2026-08-30T12:05:00.000Z");
  assert.equal(step.connectedSeconds, 100, "el hueco no cuenta");
  assert.deepEqual(step.interruptions, [
    { from: "2026-08-30T10:05:00.000Z", to: "2026-08-30T12:05:00.000Z" }
  ]);
});

test("connectedSecondsNow capa el tramo desde el último latido al umbral", () => {
  const attempt = examAttempt({ connectedSeconds: 200, lastHeartbeatAt: "2026-08-30T10:10:00.000Z" });
  assert.equal(connectedSecondsNow(attempt, "2026-08-30T10:10:10.000Z"), 210);
  // pasado el umbral, el tramo no cuenta: sigue en 200
  assert.equal(connectedSecondsNow(attempt, "2026-08-30T11:00:00.000Z"), 200);
});

test("isExpired cuando el tiempo conectado alcanza el límite; remainingSeconds llega a 0", () => {
  const live = examAttempt({ connectedSeconds: 300, timeLimitSeconds: 600, lastHeartbeatAt: "2026-08-30T10:05:00.000Z" });
  assert.equal(isExpired(live, "2026-08-30T10:05:05.000Z"), false);
  assert.equal(remainingSeconds(live, "2026-08-30T10:05:05.000Z"), 295);

  const done = examAttempt({ connectedSeconds: 600, timeLimitSeconds: 600, lastHeartbeatAt: "2026-08-30T10:10:00.000Z" });
  assert.equal(isExpired(done, "2026-08-30T10:10:01.000Z"), true);
  assert.equal(remainingSeconds(done, "2026-08-30T10:10:01.000Z"), 0);
});

test("expire cierra el intento como abandoned/expired sin tocar nada más", () => {
  const attempt = examAttempt({ connectedSeconds: 600, answers: [] });
  const closed = expire(attempt, "2026-08-30T10:10:00.000Z");
  assert.equal(closed.status, "abandoned");
  assert.equal(closed.reason, "expired");
  assert.equal(closed.abandonedAt, "2026-08-30T10:10:00.000Z");
  assert.equal(closed.connectedSeconds, 600);
});

test("el umbral de interrupción es coherente con el intervalo del latido", () => {
  assert.ok(LIMITS.examInterruptionThresholdMs > LIMITS.examHeartbeatIntervalMs);
});

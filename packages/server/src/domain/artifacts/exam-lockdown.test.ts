import assert from "node:assert/strict";
import { test } from "node:test";
import { ProxusApi } from "@proxus/shared";
import type { InProgressAttempt } from "./artifact.ts";
import {
  attemptIdFromPath,
  CLOSED_ROUTES,
  findActiveExam,
  isActiveAttemptOnlyRoute,
  isClosedRoute,
  OPEN_ROUTES
} from "./exam-lockdown.ts";

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

// --- ¿Hay un examen activo? -----------------------------------------------------------------

test("findActiveExam devuelve el examen vivo y, si caducó, el intento cerrado como expired", () => {
  const live = examAttempt({ id: "live", connectedSeconds: 100, lastHeartbeatAt: "2026-08-30T10:05:00.000Z" });
  const found = findActiveExam([live], "2026-08-30T10:05:03.000Z");
  assert.equal(found?.attempt.id, "live");
  assert.equal(found?.expired, null);

  const stale = examAttempt({ id: "stale", connectedSeconds: 600, timeLimitSeconds: 600, lastHeartbeatAt: "2026-08-30T10:10:00.000Z" });
  const expired = findActiveExam([stale], "2026-08-30T10:10:05.000Z");
  assert.equal(expired?.expired?.status, "abandoned");
  assert.equal(expired?.expired?.reason, "expired");
});

test("una práctica in-progress no es un examen activo", () => {
  const practice = examAttempt({ mode: "practice", timeLimitSeconds: null });
  assert.equal(findActiveExam([practice], "2026-08-30T10:05:00.000Z"), null);
});

// --- La clasificación de rutas ------------------------------------------------------------

const routeId = (method: string, path: string) => `${method} ${path}`;

// Las cuatro rutas NDJSON sueltas no viven en `ProxusApi` (van por `HttpRouter.add`): se listan a
// mano aquí, y el guard las comprueba con el mismo `isClosedRoute`.
const RAW_ROUTES = [
  "POST /api/tutor/chat/stream",
  "POST /api/materials/:id/index",
  "POST /api/materials/:id/notes",
  "POST /api/materials/:id/assessments"
];

test("cobertura de rutas: toda ruta del router está en la lista cerrada o en la abierta, nunca en las dos", () => {
  const classified = new Set([...CLOSED_ROUTES, ...OPEN_ROUTES]);
  const overlap = CLOSED_ROUTES.filter((route) => OPEN_ROUTES.includes(route));
  assert.deepEqual(overlap, [], "ninguna ruta puede estar cerrada y abierta a la vez");

  const missing: string[] = [];
  for (const group of Object.values(ProxusApi.groups)) {
    for (const endpoint of Object.values((group as { endpoints: Record<string, { method: string; path: string }> }).endpoints)) {
      const id = routeId(endpoint.method, endpoint.path);
      if (!classified.has(id)) {
        missing.push(id);
      }
    }
  }
  for (const raw of RAW_ROUTES) {
    if (!classified.has(raw)) {
      missing.push(raw);
    }
  }
  assert.deepEqual(missing, [], "cada ruta nueva tiene que clasificarse en exam-lockdown.ts");
});

test("no sobran rutas clasificadas que ya no existan en el router", () => {
  const live = new Set<string>(RAW_ROUTES);
  for (const group of Object.values(ProxusApi.groups)) {
    for (const endpoint of Object.values((group as { endpoints: Record<string, { method: string; path: string }> }).endpoints)) {
      live.add(routeId(endpoint.method, endpoint.path));
    }
  }
  const stale = [...CLOSED_ROUTES, ...OPEN_ROUTES].filter((route) => !live.has(route));
  assert.deepEqual(stale, [], "hay rutas clasificadas que ya no existen: la lista miente");
});

test("isClosedRoute reconoce la petición concreta", () => {
  assert.equal(isClosedRoute("GET", "/api/artifacts"), true);
  assert.equal(isClosedRoute("GET", "/api/artifacts/abc123"), true);
  assert.equal(isClosedRoute("POST", "/api/tutor/chat/stream"), true);
  assert.equal(isClosedRoute("GET", "/api/materials/m1/pages/4"), true);
  // Abiertas:
  assert.equal(isClosedRoute("GET", "/api/artifacts/abc123/solvable"), false);
  assert.equal(isClosedRoute("GET", "/api/attempts/active"), false);
  assert.equal(isClosedRoute("POST", "/api/attempts/a1/heartbeat"), false);
});

test("isActiveAttemptOnlyRoute y attemptIdFromPath localizan el intento", () => {
  assert.equal(isActiveAttemptOnlyRoute("POST", "/api/artifacts/q1/attempts/att9/submit"), true);
  assert.equal(attemptIdFromPath("/api/artifacts/q1/attempts/att9/submit"), "att9");
  assert.equal(attemptIdFromPath("/api/artifacts/q1/attempts/att9/abandon"), "att9");
  assert.equal(attemptIdFromPath("/api/attempts/att9/heartbeat"), "att9");
});

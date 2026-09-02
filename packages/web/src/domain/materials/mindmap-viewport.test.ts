import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_MINDMAP_SCALE,
  MIN_MINDMAP_SCALE,
  fitMindMap,
  panBy,
  zoomAtPoint,
} from "./mindmap-viewport.ts";

test("zoomAtPoint respeta el mínimo", () => {
  const result = zoomAtPoint({ x: 10, y: 20, scale: 1 }, 0.1, { x: 50, y: 80 });
  assert.equal(result.scale, MIN_MINDMAP_SCALE);
});

test("zoomAtPoint respeta el máximo", () => {
  const result = zoomAtPoint({ x: 10, y: 20, scale: 1 }, 10, { x: 50, y: 80 });
  assert.equal(result.scale, MAX_MINDMAP_SCALE);
});

test("zoomAtPoint conserva el mismo punto del grafo bajo el cursor", () => {
  const before = { x: 30, y: -10, scale: 0.8 };
  const anchor = { x: 240, y: 160 };
  const graphPoint = {
    x: (anchor.x - before.x) / before.scale,
    y: (anchor.y - before.y) / before.scale,
  };
  const after = zoomAtPoint(before, 1.6, anchor);

  assert.equal(after.x + graphPoint.x * after.scale, anchor.x);
  assert.equal(after.y + graphPoint.y * after.scale, anchor.y);
});

test("panBy desplaza el lienzo sin cambiar el zoom", () => {
  assert.deepEqual(panBy({ x: 20, y: 30, scale: 1.2 }, -5, 8), {
    x: 15,
    y: 38,
    scale: 1.2,
  });
});

test("fitMindMap centra el grafo y deja 32 px de margen cuando cabe", () => {
  const result = fitMindMap({
    graphWidth: 400,
    graphHeight: 200,
    viewportWidth: 864,
    viewportHeight: 464,
  });

  assert.equal(result.scale, 2);
  assert.equal(result.x, 32);
  assert.equal(result.y, 32);
});

test("fitMindMap no sale del rango aunque sobre o falte espacio", () => {
  assert.equal(
    fitMindMap({ graphWidth: 100, graphHeight: 100, viewportWidth: 2_000, viewportHeight: 2_000 }).scale,
    MAX_MINDMAP_SCALE,
  );
  assert.equal(
    fitMindMap({ graphWidth: 2_000, graphHeight: 2_000, viewportWidth: 100, viewportHeight: 100 }).scale,
    MIN_MINDMAP_SCALE,
  );
});

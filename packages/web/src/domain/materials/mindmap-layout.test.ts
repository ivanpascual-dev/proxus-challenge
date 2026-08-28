import assert from "node:assert/strict";
import { test } from "node:test";
import type { MaterialTopic } from "@proxus/shared";
import { layoutMindMap } from "./mindmap-layout.ts";

const topic = (id: string, pages: number[], parentId: string | null, label?: string): MaterialTopic => ({
  id,
  label: label ?? id,
  pages,
  parentId
});

test("el nodo del material va primero y centrado en vertical", () => {
  const model = layoutMindMap([topic("a", [1], null)], "Álgebra");
  assert.equal(model.nodes[0]?.kind, "material");
  assert.equal(model.nodes[0]?.label, "Álgebra");
  assert.equal(model.nodes[0]?.y, model.height / 2);
});

test("los temas de primer nivel se ordenan por su primera página", () => {
  const model = layoutMindMap([topic("z", [8], null), topic("a", [2], null)], "M");
  const topics = model.nodes.filter((node) => node.kind === "topic");
  assert.deepEqual(topics.map((node) => node.id), ["a", "z"]);
});

test("un subtema se coloca a la derecha de su padre y hay una arista que los une", () => {
  const model = layoutMindMap([topic("root", [1], null), topic("child", [2], "root")], "M");
  const root = model.nodes.find((node) => node.id === "root");
  const child = model.nodes.find((node) => node.id === "child");
  assert.ok(root && child);
  assert.ok(child!.x > root!.x + root!.width);
  assert.ok(model.edges.some((edge) => edge.toX === child!.x && edge.toY === child!.y));
});

test("cada grupo de primer nivel tiene su groupIndex y el subtema hereda el del padre", () => {
  const model = layoutMindMap(
    [topic("a", [1], null), topic("b", [5], null), topic("a1", [2], "a")],
    "M"
  );
  const a = model.nodes.find((node) => node.id === "a");
  const b = model.nodes.find((node) => node.id === "b");
  const a1 = model.nodes.find((node) => node.id === "a1");
  assert.equal(a?.groupIndex, 0);
  assert.equal(b?.groupIndex, 1);
  assert.equal(a1?.groupIndex, 0);
  assert.equal(model.nodes.find((node) => node.kind === "material")?.groupIndex, null);
});

test("una etiqueta larga se parte en varias líneas y ensancha o alarga la caja", () => {
  const short = layoutMindMap([topic("s", [1], null, "Set")], "M");
  const long = layoutMindMap(
    [topic("l", [1], null, "Representación interna de conjuntos y operaciones de pertenencia")],
    "M"
  );
  const shortNode = short.nodes.find((node) => node.id === "s")!;
  const longNode = long.nodes.find((node) => node.id === "l")!;
  assert.ok(longNode.lines.length > 1);
  assert.ok(longNode.height > shortNode.height);
});

test("un parentId colgante trata al tema como raíz", () => {
  const model = layoutMindMap([topic("x", [1], "no-existe")], "M");
  assert.equal(model.nodes.find((node) => node.id === "x")?.kind, "topic");
});

import type { MaterialTopic } from "@proxus/shared";

// Coloca el mapa mental en un árbol izquierda→derecha de tres columnas: el material, sus temas de
// primer nivel y los subtemas. Es una función pura. Las cajas se dimensionan para que quepa TODO el
// texto: la etiqueta se parte en líneas y, si una palabra no cabe, la caja se ensancha.

export const LABEL_FONT_PX = 13;
export const LABEL_FONT_WEIGHT = 600;
export const PAGES_FONT_PX = 11;

const COLUMN_GAP = 76;
const ROW_GAP = 16;
const BAND_GAP = 10;
const MARGIN = 16;
const PAD_X = 14;
const PAD_Y = 11;
const LINE_HEIGHT = 17;
const PAGES_LINE = 16;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 42;
const WRAP_TARGET_WIDTH = 210;

// Ancho aproximado de una línea cuando no hay un medidor real (tests, SSR).
const estimateWidth = (text: string, fontPx: number): number => text.length * fontPx * 0.58;

export type MeasureText = (text: string, fontPx: number, fontWeight: number) => number;

export interface MindMapNode {
  readonly id: string;
  readonly label: string;
  readonly kind: "material" | "topic" | "subtopic";
  readonly pages: readonly number[];
  readonly groupIndex: number | null;
  readonly lines: readonly string[];
  readonly pagesText: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MindMapEdge {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export interface MindMapModel {
  readonly nodes: readonly MindMapNode[];
  readonly edges: readonly MindMapEdge[];
  readonly width: number;
  readonly height: number;
}

const firstPage = (topic: MaterialTopic): number =>
  topic.pages.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...topic.pages);

const byFirstPageThenLabel = (a: MaterialTopic, b: MaterialTopic): number =>
  firstPage(a) - firstPage(b) || a.label.localeCompare(b.label);

const wrapLabel = (label: string, measure: MeasureText): readonly string[] => {
  const words = label.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) {
    return [label];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (current !== "" && measure(candidate, LABEL_FONT_PX, LABEL_FONT_WEIGHT) > WRAP_TARGET_WIDTH) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
};

const pageRange = (pages: readonly number[]): string => {
  if (pages.length === 0) {
    return "";
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return first === last ? `p. ${first}` : `p. ${first}–${last}`;
};

interface SizedNode {
  readonly id: string;
  readonly label: string;
  readonly kind: MindMapNode["kind"];
  readonly pages: readonly number[];
  readonly groupIndex: number | null;
  readonly lines: readonly string[];
  readonly pagesText: string;
  readonly width: number;
  readonly height: number;
}

const sizeNode = (
  id: string,
  label: string,
  kind: MindMapNode["kind"],
  pages: readonly number[],
  groupIndex: number | null,
  measure: MeasureText
): SizedNode => {
  const lines = wrapLabel(label, measure);
  const pagesText = pageRange(pages);
  const longestLine = Math.max(...lines.map((line) => measure(line, LABEL_FONT_PX, LABEL_FONT_WEIGHT)));
  const pagesWidth = pagesText === "" ? 0 : measure(pagesText, PAGES_FONT_PX, 400);
  const width = Math.max(MIN_WIDTH, Math.ceil(Math.max(longestLine, pagesWidth) + PAD_X * 2));
  const textHeight = lines.length * LINE_HEIGHT + (pagesText === "" ? 0 : PAGES_LINE);
  const height = Math.max(MIN_HEIGHT, Math.ceil(textHeight + PAD_Y * 2));
  return { id, label, kind, pages, groupIndex, lines, pagesText, width, height };
};

export const layoutMindMap = (
  topics: readonly MaterialTopic[],
  materialLabel: string,
  measure: MeasureText = (text, fontPx) => estimateWidth(text, fontPx)
): MindMapModel => {
  const ids = new Set(topics.map((topic) => topic.id));
  const effectiveParent = (topic: MaterialTopic): string | null =>
    topic.parentId !== null && ids.has(topic.parentId) && topic.parentId !== topic.id
      ? topic.parentId
      : null;

  const roots = topics.filter((topic) => effectiveParent(topic) === null).sort(byFirstPageThenLabel);
  const childrenOf = (rootId: string) =>
    topics.filter((topic) => effectiveParent(topic) === rootId).sort(byFirstPageThenLabel);

  const material = sizeNode("__material__", materialLabel, "material", [], null, measure);

  const rootSized = roots.map((root, index) => ({
    root: sizeNode(root.id, root.label, "topic", root.pages, index, measure),
    children: childrenOf(root.id).map((child) => sizeNode(child.id, child.label, "subtopic", child.pages, index, measure))
  }));

  const maxRootWidth = Math.max(material.width, ...rootSized.map((entry) => entry.root.width), MIN_WIDTH);
  const materialX = MARGIN;
  const rootX = MARGIN + material.width + COLUMN_GAP;
  const subtopicX = rootX + maxRootWidth + COLUMN_GAP;

  const placed: MindMapNode[] = [];
  const edges: MindMapEdge[] = [];
  let hasSubtopics = false;
  let cursorY = MARGIN;

  for (const { root, children } of rootSized) {
    const childrenHeight = children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.height, 0) + ROW_GAP * (children.length - 1);
    const bandHeight = Math.max(root.height, childrenHeight, MIN_HEIGHT);
    const rootY = cursorY + bandHeight / 2;

    placed.push({ ...root, x: rootX, y: rootY });

    let childCursor = cursorY + (bandHeight - childrenHeight) / 2;
    for (const child of children) {
      hasSubtopics = true;
      const childY = childCursor + child.height / 2;
      placed.push({ ...child, x: subtopicX, y: childY });
      edges.push({ fromX: rootX + root.width, fromY: rootY, toX: subtopicX, toY: childY });
      childCursor += child.height + ROW_GAP;
    }

    cursorY += bandHeight + BAND_GAP;
  }

  const contentHeight = Math.max(cursorY - BAND_GAP, MARGIN + material.height);
  const height = contentHeight + MARGIN;
  const materialY = height / 2;

  for (const node of placed) {
    if (node.kind === "topic") {
      edges.push({ fromX: materialX + material.width, fromY: materialY, toX: rootX, toY: node.y });
    }
  }

  const width = (hasSubtopics ? subtopicX + Math.max(...placed.filter((n) => n.kind === "subtopic").map((n) => n.width)) : rootX + maxRootWidth) + MARGIN;

  return {
    nodes: [{ ...material, x: materialX, y: materialY }, ...placed],
    edges,
    width,
    height
  };
};

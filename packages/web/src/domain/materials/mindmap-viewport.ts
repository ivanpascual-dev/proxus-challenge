export interface CanvasTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface MindMapBounds {
  readonly graphWidth: number;
  readonly graphHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export const MIN_MINDMAP_SCALE = 0.45;
export const MAX_MINDMAP_SCALE = 2.25;
export const MINDMAP_FIT_MARGIN = 32;

const clampScale = (scale: number): number =>
  Math.min(MAX_MINDMAP_SCALE, Math.max(MIN_MINDMAP_SCALE, scale));

// Conserva bajo el cursor el mismo punto del grafo: primero lo expresa en coordenadas del grafo y
// después recoloca el origen para que ese punto vuelva a caer exactamente bajo el ancla.
export const zoomAtPoint = (
  transform: CanvasTransform,
  requestedScale: number,
  anchor: CanvasPoint,
): CanvasTransform => {
  const scale = clampScale(requestedScale);
  const graphX = (anchor.x - transform.x) / transform.scale;
  const graphY = (anchor.y - transform.y) / transform.scale;
  return {
    x: anchor.x - graphX * scale,
    y: anchor.y - graphY * scale,
    scale,
  };
};

export const panBy = (
  transform: CanvasTransform,
  deltaX: number,
  deltaY: number,
): CanvasTransform => ({
  ...transform,
  x: transform.x + deltaX,
  y: transform.y + deltaY,
});

export const fitMindMap = ({
  graphWidth,
  graphHeight,
  viewportWidth,
  viewportHeight,
}: MindMapBounds): CanvasTransform => {
  if (graphWidth <= 0 || graphHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { x: MINDMAP_FIT_MARGIN, y: MINDMAP_FIT_MARGIN, scale: 1 };
  }

  const availableWidth = Math.max(0, viewportWidth - MINDMAP_FIT_MARGIN * 2);
  const availableHeight = Math.max(0, viewportHeight - MINDMAP_FIT_MARGIN * 2);
  const scale = clampScale(Math.min(availableWidth / graphWidth, availableHeight / graphHeight));

  return {
    x: (viewportWidth - graphWidth * scale) / 2,
    y: (viewportHeight - graphHeight * scale) / 2,
    scale,
  };
};

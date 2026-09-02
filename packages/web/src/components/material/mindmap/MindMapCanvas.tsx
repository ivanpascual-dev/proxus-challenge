import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialIndex } from "@proxus/shared";
import {
  LABEL_FONT_PX,
  LABEL_FONT_WEIGHT,
  layoutMindMap,
  type MeasureText,
  type MindMapEdge,
  type MindMapNode,
} from "../../../domain/materials/mindmap-layout.ts";
import {
  fitMindMap,
  panBy,
  zoomAtPoint,
  type CanvasTransform,
} from "../../../domain/materials/mindmap-viewport.ts";
import { IconButton } from "../../ui/IconButton.tsx";
import { TopicActionsPopover, type PopoverAnchor } from "./TopicActionsPopover.tsx";

interface MindMapCanvasProps {
  readonly index: MaterialIndex;
  readonly title: string;
  readonly onGenerateControl: (topicId: string, topicLabel: string) => void;
  readonly onGoToNotes: (topicPages: readonly number[]) => void;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
const measureText: MeasureText = (text, fontPx, fontWeight) => {
  if (measureContext === undefined) {
    measureContext = document.createElement("canvas").getContext("2d");
  }
  if (measureContext === null) {
    return text.length * fontPx * 0.58;
  }
  measureContext.font = `${fontWeight} ${fontPx}px "Montserrat", ui-sans-serif, system-ui, sans-serif`;
  return measureContext.measureText(text).width;
};

const GROUP_HUES = [262, 330, 25, 150, 200, 45];
const hueOf = (groupIndex: number): number =>
  GROUP_HUES[groupIndex % GROUP_HUES.length] ?? 262;

const nodeFill = (node: MindMapNode, colorByGroup: boolean): string => {
  if (node.kind === "material") {
    return "var(--color-brand-soft)";
  }
  if (!colorByGroup || node.groupIndex === null) {
    return node.kind === "topic"
      ? "var(--color-surface)"
      : "var(--color-surface-muted)";
  }
  const mix = node.kind === "topic" ? 26 : 12;
  return `color-mix(in srgb, hsl(${hueOf(node.groupIndex)} 70% 55%) ${mix}%, var(--color-surface))`;
};

const nodeStroke = (node: MindMapNode, colorByGroup: boolean): string => {
  if (colorByGroup && node.groupIndex !== null && node.kind !== "material") {
    return `color-mix(in srgb, hsl(${hueOf(node.groupIndex)} 70% 50%) 60%, var(--color-border))`;
  }
  return "var(--color-border)";
};

export function MindMapCanvas({
  index,
  title,
  onGenerateControl,
  onGoToNotes,
}: MindMapCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const dragRef = useRef<{ readonly pointerId: number; readonly x: number; readonly y: number } | null>(null);
  const fittedModelRef = useRef<object | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<CanvasTransform>({ x: 32, y: 32, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [colorByGroup, setColorByGroup] = useState(false);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const model = useMemo(
    () => layoutMindMap(index.topics, title, measureText),
    [index.topics, title],
  );
  const openNode = model.nodes.find((node) => node.id === openNodeId) ?? null;

  useEffect(() => {
    const element = viewportRef.current;
    if (element === null) {
      return;
    }
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setViewport((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useCallback(() => {
    if (viewport.width <= 0 || viewport.height <= 0) {
      return;
    }
    setTransform(fitMindMap({
      graphWidth: model.width,
      graphHeight: model.height,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    }));
  }, [model.height, model.width, viewport.height, viewport.width]);

  useEffect(() => {
    if (viewport.width > 0 && viewport.height > 0 && fittedModelRef.current !== model) {
      fittedModelRef.current = model;
      fit();
    }
  }, [fit, model, viewport.height, viewport.width]);

  const zoomFromCenter = (factor: number) => {
    setTransform((current) => zoomAtPoint(
      current,
      current.scale * factor,
      { x: viewport.width / 2, y: viewport.height / 2 },
    ));
  };

  const onMapKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) {
      return;
    }
    if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
      event.preventDefault();
      zoomFromCenter(1.2);
      return;
    }
    if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
      event.preventDefault();
      zoomFromCenter(1 / 1.2);
      return;
    }
    if (event.key === "0" || event.code === "Numpad0") {
      event.preventDefault();
      fit();
    }
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("[data-mindmap-node]") !== null) {
      return;
    }
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    dragRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    setTransform((current) => panBy(current, deltaX, deltaY));
  };

  const endDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  // La rueda se escucha en nativo y con `passive: false` a propósito. React registra `onWheel` como
  // listener pasivo, así que su `preventDefault()` no hace nada: la consola avisa en cada rueda y,
  // peor, ctrl+rueda sobre el mapa acababa aplicando también el zoom global del navegador, que F5-22
  // manda impedir mientras el cursor está dentro del lienzo.
  useEffect(() => {
    const element = svgRef.current;
    if (element === null) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const rect = element.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setTransform((current) =>
          zoomAtPoint(current, current.scale * Math.exp(-event.deltaY * 0.002), anchor),
        );
        return;
      }
      setTransform((current) => panBy(current, -event.deltaX, -event.deltaY));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const activateNode = (node: MindMapNode, trigger: SVGGElement) => {
    if (node.kind === "material") {
      return;
    }
    trigger.focus();
    setOpenNodeId((current) => current === node.id ? null : node.id);
  };

  const anchorFor = (node: MindMapNode): PopoverAnchor => ({
    left: transform.x + node.x * transform.scale,
    top: transform.y + (node.y - node.height / 2) * transform.scale,
    width: node.width * transform.scale,
    height: node.height * transform.scale,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-canvas">
      <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-border border-b px-3">
        <p className="text-muted text-xs">Arrastra para mover. Ctrl + rueda amplía bajo el cursor.</p>
        <div className="flex items-center gap-1" aria-label="Controles del mapa">
          <button
            type="button"
            onClick={() => setColorByGroup((value) => !value)}
            aria-pressed={colorByGroup}
            className={`mr-2 min-h-8 rounded-md border px-3 text-xs transition ${
              colorByGroup
                ? "border-brand bg-brand-soft text-heading"
                : "border-border text-muted hover:text-heading"
            }`}
          >
            Colores por grupo
          </button>
          <IconButton icon="zoom-out" label="Alejar mapa" onClick={() => zoomFromCenter(1 / 1.2)} />
          <output className="w-12 text-center text-muted text-xs" aria-live="polite">
            {Math.round(transform.scale * 100)}%
          </output>
          <IconButton icon="zoom-in" label="Ampliar mapa" onClick={() => zoomFromCenter(1.2)} />
          <IconButton icon="fit-width" label="Centrar mapa" onClick={fit} />
        </div>
      </div>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        role="region"
        aria-label={`Lienzo del mapa mental de ${title}`}
        aria-keyshortcuts="Control++ Control+- Control+0"
        tabIndex={0}
        onKeyDown={onMapKeyDown}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          role="group"
          aria-label={`Mapa mental de ${title}`}
          className={dragging ? "cursor-grabbing select-none" : "cursor-grab select-none"}
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={(event) => {
            if ((event.target as Element).closest("[data-mindmap-node]") === null) {
              fit();
            }
          }}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}>
            {model.edges.map((edge, index) => (
              <path
                key={index}
                d={edgePath(edge)}
                fill="none"
                stroke="var(--color-border-strong)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
            {model.nodes.map((node) => (
              <MindMapNodeView
                key={node.id}
                ref={(element) => {
                  if (element === null) {
                    nodeRefs.current.delete(node.id);
                  } else {
                    nodeRefs.current.set(node.id, element);
                  }
                }}
                node={node}
                colorByGroup={colorByGroup}
                open={node.id === openNodeId}
                focused={node.id === focusedNodeId}
                onFocus={() => setFocusedNodeId(node.id)}
                onBlur={() => setFocusedNodeId((current) => current === node.id ? null : current)}
                onActivate={(trigger) => activateNode(node, trigger)}
              />
            ))}
          </g>
        </svg>

        {openNode !== null && (
          <TopicActionsPopover
            node={openNode}
            anchor={anchorFor(openNode)}
            viewportWidth={viewport.width}
            viewportHeight={viewport.height}
            trigger={nodeRefs.current.get(openNode.id) ?? null}
            onClose={() => setOpenNodeId(null)}
            onGenerateControl={() => {
              onGenerateControl(openNode.id, openNode.label);
              setOpenNodeId(null);
            }}
            onGoToNotes={() => {
              onGoToNotes(openNode.pages);
              setOpenNodeId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface MindMapNodeViewProps {
  readonly node: MindMapNode;
  readonly colorByGroup: boolean;
  readonly open: boolean;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onActivate: (trigger: SVGGElement) => void;
}

function MindMapNodeView({
  ref,
  node,
  colorByGroup,
  open,
  focused,
  onFocus,
  onBlur,
  onActivate,
}: MindMapNodeViewProps & { readonly ref: (element: SVGGElement | null) => void }) {
  const firstBaseline = 11 + LABEL_FONT_PX;
  const canOpen = node.kind !== "material";
  const active = open || focused;

  return (
    <g
      ref={ref}
      data-mindmap-node=""
      transform={`translate(${node.x} ${node.y - node.height / 2})`}
      role={canOpen ? "button" : undefined}
      tabIndex={canOpen ? 0 : undefined}
      aria-label={canOpen
        ? `${node.label}${node.pagesText === "" ? "" : `, ${node.pagesText}`}. Abrir acciones`
        : undefined}
      aria-haspopup={canOpen ? "menu" : undefined}
      aria-expanded={canOpen ? open : undefined}
      onFocus={canOpen ? onFocus : undefined}
      onBlur={canOpen ? onBlur : undefined}
      onClick={canOpen ? (event) => onActivate(event.currentTarget) : undefined}
      onKeyDown={canOpen ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate(event.currentTarget);
        }
      } : undefined}
      style={{ cursor: canOpen ? "pointer" : "default", outline: "none" }}
    >
      <title>
        {node.label}
        {node.pagesText === "" ? "" : ` · ${node.pagesText}`}
      </title>
      <rect
        width={node.width}
        height={node.height}
        rx={8}
        fill={nodeFill(node, colorByGroup)}
        stroke={active ? "var(--color-brand)" : nodeStroke(node, colorByGroup)}
        strokeWidth={active ? 2 : 1}
        vectorEffect="non-scaling-stroke"
      />
      {focused && (
        <rect
          x={-4}
          y={-4}
          width={node.width + 8}
          height={node.height + 8}
          rx={11}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {node.lines.map((line, index) => (
        <text
          key={index}
          x={14}
          y={firstBaseline + index * 17}
          fill="var(--color-heading)"
          fontSize={LABEL_FONT_PX}
          fontWeight={LABEL_FONT_WEIGHT}
          pointerEvents="none"
        >
          {line}
        </text>
      ))}
      {node.pagesText !== "" && (
        <text
          x={14}
          y={firstBaseline + (node.lines.length - 1) * 17 + 15}
          fill="var(--color-muted)"
          fontSize={11}
          pointerEvents="none"
        >
          {node.pagesText}
        </text>
      )}
    </g>
  );
}

const edgePath = ({ fromX, fromY, toX, toY }: MindMapEdge): string => {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
};

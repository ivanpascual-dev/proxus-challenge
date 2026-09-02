import { useEffect, useId, useRef } from "react";
import type { MindMapNode } from "../../../domain/materials/mindmap-layout.ts";
import { Icon, type IconName } from "../../ui/Icon.tsx";

export interface PopoverAnchor {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface TopicActionsPopoverProps {
  readonly node: MindMapNode;
  readonly anchor: PopoverAnchor;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly trigger: SVGGElement | null;
  readonly onClose: () => void;
  readonly onGenerateControl: () => void;
  readonly onGoToNotes: () => void;
}

const POPOVER_WIDTH = 232;
const POPOVER_HEIGHT = 116;
const VIEWPORT_GAP = 12;
const ANCHOR_GAP = 10;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function TopicActionsPopover({
  node,
  anchor,
  viewportWidth,
  viewportHeight,
  trigger,
  onClose,
  onGenerateControl,
  onGoToNotes,
}: TopicActionsPopoverProps) {
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const left = clamp(
    anchor.left + anchor.width / 2 - POPOVER_WIDTH / 2,
    VIEWPORT_GAP,
    viewportWidth - POPOVER_WIDTH - VIEWPORT_GAP,
  );
  const fitsBelow = anchor.top + anchor.height + ANCHOR_GAP + POPOVER_HEIGHT <= viewportHeight;
  const top = fitsBelow
    ? anchor.top + anchor.height + ANCHOR_GAP
    : Math.max(VIEWPORT_GAP, anchor.top - POPOVER_HEIGHT - ANCHOR_GAP);

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']");
    firstItem?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!menuRef.current?.contains(target) && !trigger?.contains(target)) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, trigger]);

  const closeAndReturnFocus = () => {
    onClose();
    requestAnimationFrame(() => trigger?.focus());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(current + offset + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`Acciones de ${node.label}`}
      className="absolute z-20 w-[232px] overflow-hidden rounded-[10px] border border-border-strong bg-surface p-1.5 shadow-xl"
      style={{ left, top }}
      onKeyDown={onKeyDown}
    >
      <TopicAction icon="notes" label="Ir a apuntes" onClick={onGoToNotes} />
      <TopicAction icon="check-circle" label="Crear Control" onClick={onGenerateControl} />
    </div>
  );
}

function TopicAction({
  icon,
  label,
  onClick,
}: {
  readonly icon: IconName;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left text-body text-sm transition hover:bg-surface-muted hover:text-heading"
      onClick={onClick}
    >
      <span className="grid size-8 shrink-0 place-items-center text-heading">
        <Icon name={icon} size={18} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

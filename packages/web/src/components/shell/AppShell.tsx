import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  clampMaterialRatio,
  decodeStoredLayout,
  encodeLayoutForStorage,
  ratioFromPointer,
  type SplitBounds
} from "../../domain/workspace/layout.ts";

// Layout visual del escritorio (fase 5, §4.2). Solo posee proporción y breakpoint: no consulta APIs,
// no sabe qué hay dentro de cada slot. `material === null` es el estado inicial y el que se recupera
// al cerrar el material (decisión 7): Sym ocupa entonces todo el espacio de trabajo.

const SIDEBAR_WIDTH_PX = 224;
const SIDEBAR_RAIL_PX = 56;
const MIN_PANEL_WIDTH_PX = 420;
const SEPARATOR_WIDTH_PX = 12;
const KEYBOARD_STEP_PX = 24;
const RATIO_STORAGE_KEY = "symma.workspace.materialRatio";
const SIDEBAR_COLLAPSED_KEY = "symma.workspace.sidebarCollapsed";

// Plan de correcciones §4.2.8 / C5-13: el sidebar alterna 224px y un rail de 56px. Solo se persiste
// ese booleano; como con el ratio, un `localStorage` bloqueado o corrupto no debe tumbar la interfaz.
const readSidebarCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
};

const persistSidebarCollapsed = (collapsed: boolean): void => {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "true" : "false");
  } catch {
    // la preferencia ya se aplica en memoria; persistir es una mejora, no un requisito
  }
};

const readStoredRatio = (): number => {
  try {
    return decodeStoredLayout(window.localStorage.getItem(RATIO_STORAGE_KEY)).materialRatio;
  } catch {
    return decodeStoredLayout(null).materialRatio;
  }
};

// Persistir puede fallar (cuota agotada, almacenamiento bloqueado): el ratio ya se aplicó en memoria,
// así que un fallo aquí no debe tumbar la interfaz (riesgo 11 del plan).
const persistRatio = (ratio: number): void => {
  try {
    window.localStorage.setItem(RATIO_STORAGE_KEY, encodeLayoutForStorage({ mode: "chat", materialRatio: ratio }));
  } catch {
    // el layout ya se aplica en memoria; persistir es una mejora, no un requisito
  }
};

interface AppShellProps {
  // `sidebar` es una función porque el estado de contraído lo posee `AppShell` (§4.2.8) y lo entrega a
  // la barra: `material` y `chat` no lo necesitan y siguen siendo nodos.
  readonly sidebar: (opts: { readonly collapsed: boolean; readonly onToggleCollapsed: () => void }) => ReactNode;
  readonly material: ReactNode | null;
  readonly chat: ReactNode;
}

export function AppShell({ sidebar, material, chat }: AppShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(readStoredRatio);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_RAIL_PX : SIDEBAR_WIDTH_PX;

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      persistSidebarCollapsed(next);
      return next;
    });
  };
  const [bounds, setBounds] = useState<SplitBounds>({
    availableWidth: 0,
    minMaterialWidth: MIN_PANEL_WIDTH_PX,
    minChatWidth: MIN_PANEL_WIDTH_PX
  });

  useEffect(() => {
    const el = contentRef.current;
    if (el === null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setBounds({
        availableWidth: Math.max(width - SEPARATOR_WIDTH_PX, 0),
        minMaterialWidth: MIN_PANEL_WIDTH_PX,
        minChatWidth: MIN_PANEL_WIDTH_PX
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const hasMaterial = material !== null;
  const canSplit = hasMaterial && bounds.availableWidth >= bounds.minMaterialWidth + bounds.minChatWidth;
  const clampedRatio = clampMaterialRatio(ratio, bounds);

  const applyRatio = (next: number) => {
    const clamped = clampMaterialRatio(next, bounds);
    setRatio(clamped);
    return clamped;
  };

  const onSeparatorPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onSeparatorPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const contentLeft = contentRef.current?.getBoundingClientRect().left ?? 0;
    applyRatio(ratioFromPointer(event.clientX, contentLeft, bounds));
  };

  const onSeparatorPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    persistRatio(clampMaterialRatio(ratio, bounds));
  };

  const onSeparatorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (bounds.availableWidth <= 0) {
      return;
    }
    const step = KEYBOARD_STEP_PX / bounds.availableWidth;
    const minRatio = bounds.minMaterialWidth / bounds.availableWidth;
    const maxRatio = 1 - bounds.minChatWidth / bounds.availableWidth;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      persistRatio(applyRatio(clampedRatio - step));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      persistRatio(applyRatio(clampedRatio + step));
    } else if (event.key === "Home") {
      event.preventDefault();
      persistRatio(applyRatio(minRatio));
    } else if (event.key === "End") {
      event.preventDefault();
      persistRatio(applyRatio(maxRatio));
    }
  };

  const materialPercent = Math.round(clampedRatio * 100);

  return (
    <div className="grid h-screen min-h-screen overflow-hidden bg-canvas text-heading" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}>
      <aside className="zone-edge-right relative z-10 h-screen overflow-hidden border-border border-r bg-surface" style={{ width: sidebarWidth }}>
        {sidebar({ collapsed: sidebarCollapsed, onToggleCollapsed: toggleSidebarCollapsed })}
      </aside>

      <div ref={contentRef} className="flex h-screen min-w-0 overflow-hidden">
        {canSplit && material !== null ? (
          <>
            <div className="h-screen min-w-0 overflow-hidden bg-canvas" style={{ flex: `0 0 ${materialPercent}%`, minWidth: MIN_PANEL_WIDTH_PX }}>
              {material}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Ajustar el ancho entre el material y Sym"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={materialPercent}
              tabIndex={0}
              onPointerDown={onSeparatorPointerDown}
              onPointerMove={onSeparatorPointerMove}
              onPointerUp={onSeparatorPointerUp}
              onPointerCancel={onSeparatorPointerUp}
              onKeyDown={onSeparatorKeyDown}
              className="relative w-px shrink-0 cursor-col-resize bg-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              style={{ flex: `0 0 ${SEPARATOR_WIDTH_PX}px` }}
            >
              <span className="-translate-x-1/2 absolute inset-y-0 left-1/2 w-3" />
            </div>
            <div className="h-screen min-w-0 flex-1 overflow-hidden bg-surface">
              {chat}
            </div>
          </>
        ) : hasMaterial ? (
          // El viewport no admite los dos mínimos: se prioriza lo que el alumno abrió explícitamente
          // (adaptación mínima, no la selección de superficie completa que llega en P3).
          <div className="h-screen min-w-0 flex-1 overflow-hidden bg-canvas">
            {material}
          </div>
        ) : (
          <div className="h-screen min-w-0 flex-1 overflow-hidden bg-surface">
            {chat}
          </div>
        )}
      </div>
    </div>
  );
}

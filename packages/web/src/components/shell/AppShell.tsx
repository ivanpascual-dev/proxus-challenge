import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  clampMaterialRatio,
  decodeStoredLayout,
  encodeLayoutForStorage,
  ratioFromPointer,
  type FoldAllCommand,
  type SplitBounds
} from "../../domain/workspace/layout.ts";
import { resolveSeparatorGesture } from "../../domain/workspace/separator-gesture.ts";
import { Icon } from "../ui/Icon.tsx";
import { SymAvatar } from "../ui/SymAvatar.tsx";

// Layout visual del escritorio (fase 5, §4.2). Solo posee proporción y breakpoint: no consulta APIs,
// no sabe qué hay dentro de cada slot. `material === null` es el estado inicial y el que se recupera
// al cerrar el material (decisión 7): Sym ocupa entonces todo el espacio de trabajo.

const SIDEBAR_WIDTH_PX = 224;
const SIDEBAR_RAIL_PX = 56;
const CHAT_RAIL_PX = 56;
const MIN_PANEL_WIDTH_PX = 420;
const SEPARATOR_WIDTH_PX = 9;
const KEYBOARD_STEP_PX = 24;
const RATIO_STORAGE_KEY = "symma.workspace.materialRatio";
const SIDEBAR_COLLAPSED_KEY = "symma.workspace.sidebarCollapsed";
const CHAT_COLLAPSED_KEY = "symma.workspace.chatCollapsed";

// Plan de correcciones §4.2.8 / C5-13 y fase 5 §11.8: el sidebar alterna 224px y un rail de 56px, y
// Sym hace lo mismo con su propio rail. Solo se persisten esos dos booleanos y el ratio (F5-52); como
// con el ratio, un `localStorage` bloqueado o corrupto no debe tumbar la interfaz.
const readCollapsed = (key: string): boolean => {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const persistCollapsed = (key: string, collapsed: boolean): void => {
  try {
    window.localStorage.setItem(key, collapsed ? "true" : "false");
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
  // También función, y por la misma razón: el material no posee el estado de plegado, pero ofrece el
  // control que lo alterna de una vez (barra lateral y Sym a la vez) para dejar la lectura a solas.
  readonly material: ((opts: {
    readonly focusMode: boolean;
    readonly onToggleFocusMode: () => void;
    readonly foldAll: FoldAllCommand | null;
    // Adjuntar contexto desde el material (una página del PDF, §5.2) tiene que poder enseñar el chip:
    // un chip que se propone detrás del rail plegado no cumple la invariante 9.
    readonly onRevealChat: () => void;
  }) => ReactNode) | null;
  readonly chat: ReactNode;
}

export function AppShell({ sidebar, material, chat }: AppShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(readStoredRatio);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readCollapsed(SIDEBAR_COLLAPSED_KEY));
  const [chatCollapsed, setChatCollapsed] = useState(() => readCollapsed(CHAT_COLLAPSED_KEY));
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_RAIL_PX : SIDEBAR_WIDTH_PX;

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      persistCollapsed(SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  };

  const setChatCollapsedAndPersist = (next: boolean) => {
    persistCollapsed(CHAT_COLLAPSED_KEY, next);
    setChatCollapsed(next);
  };

  // Plegar todo y desplegar todo: un solo gesto para quedarse a solas con el material y otro para
  // recuperar el escritorio entero. No es un cuarto estado, es escribir los dos que ya existen.
  const focusMode = sidebarCollapsed && chatCollapsed;
  // Lo que se manda hacia el material es la orden, no el estado: plegar o desplegar a Sym por su
  // cuenta no debe tocar el índice de bloques de Apuntes.
  const [foldAll, setFoldAll] = useState<FoldAllCommand | null>(null);

  const toggleFocusMode = () => {
    const next = !focusMode;
    persistCollapsed(SIDEBAR_COLLAPSED_KEY, next);
    setSidebarCollapsed(next);
    setChatCollapsedAndPersist(next);
    setFoldAll((current) => ({ collapsed: next, seq: (current?.seq ?? 0) + 1 }));
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

  // Dónde empezó el arrastre en curso: es lo único que hace falta para saber, al soltar, si el alumno
  // arrastró o solo pulsó (§11.7). `null` cuando no hay ningún puntero capturado.
  const pointerStartXRef = useRef<number | null>(null);
  // El puntero sobre la agarradera dispara además un `click` al soltar. Ese click ya está resuelto por
  // el gesto, así que se marca para ignorarlo y dejar el `onClick` solo para Enter y Espacio.
  const clickFromPointerRef = useRef(false);

  const onSeparatorPointerDown = (event: PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartXRef.current = event.clientX;
  };

  const onSeparatorPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    const contentLeft = contentRef.current?.getBoundingClientRect().left ?? 0;
    applyRatio(ratioFromPointer(event.clientX, contentLeft, bounds));
  };

  const onSeparatorPointerUp = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const startX = pointerStartXRef.current;
    pointerStartXRef.current = null;
    // Sin `pointerdown` previo (un `pointercancel` suelto, por ejemplo) no hay gesto que resolver: se
    // conserva el ratio y no se pliega nada.
    if (startX !== null && resolveSeparatorGesture(startX, event.clientX) === "toggle") {
      setChatCollapsedAndPersist(true);
      return;
    }
    persistRatio(clampMaterialRatio(ratio, bounds));
  };

  // Un gesto cancelado por el navegador no es una pulsación: se guarda el ratio al que se hubiera
  // llegado y no se pliega nada.
  const onSeparatorPointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerStartXRef.current = null;
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
  // La preferencia persistida solo se aplica donde hay algo de lo que plegarse. Sin material, o si el
  // viewport no admite los dos mínimos, Sym es la única superficie: plegarlo dejaría la pantalla vacía
  // (riesgo 19 del plan), así que ni se ofrece ni se aplica.
  const symCollapsed = chatCollapsed && canSplit;

  return (
    <div className="grid h-screen min-h-screen overflow-hidden bg-canvas text-heading" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}>
      <aside className="zone-edge-right relative z-10 h-screen overflow-hidden border-border border-r bg-surface" style={{ width: sidebarWidth }}>
        {sidebar({ collapsed: sidebarCollapsed, onToggleCollapsed: toggleSidebarCollapsed })}
      </aside>

      <div ref={contentRef} className="flex h-screen min-w-0 overflow-hidden">
        {canSplit && material !== null ? (
          // El orden de los hijos no cambia al plegar: el chat ocupa siempre el mismo hueco del árbol,
          // así React no lo desmonta y sobreviven el borrador, el contexto y un stream en curso
          // (§11.8, F5-51). Plegado se oculta con `hidden`, no se quita.
          <>
            <div
              className="h-screen min-w-0 overflow-hidden bg-canvas"
              style={symCollapsed
                ? { flex: "1 1 auto", minWidth: MIN_PANEL_WIDTH_PX }
                : { flex: `0 0 ${materialPercent}%`, minWidth: MIN_PANEL_WIDTH_PX }}
            >
              {material({
                focusMode,
                onToggleFocusMode: toggleFocusMode,
                foldAll,
                onRevealChat: () => setChatCollapsedAndPersist(false)
              })}
            </div>
            {!symCollapsed && (
              // Banda de 9px: dentro, la línea de 1px del separador; encima, la agarradera. La
              // agarradera es un hermano y no un hijo del `role="separator"`, porque un widget de
              // separador no puede contener un control (§11.7).
              <div className="relative shrink-0" style={{ flex: `0 0 ${SEPARATOR_WIDTH_PX}px` }}>
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
                  onPointerCancel={onSeparatorPointerCancel}
                  onKeyDown={onSeparatorKeyDown}
                  className="group absolute inset-0 cursor-col-resize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <span className="-translate-x-1/2 absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  aria-label="Plegar a Sym"
                  title="Plegar a Sym"
                  onPointerDown={(event) => {
                    clickFromPointerRef.current = true;
                    onSeparatorPointerDown(event);
                  }}
                  onPointerMove={onSeparatorPointerMove}
                  onPointerUp={onSeparatorPointerUp}
                  onPointerCancel={onSeparatorPointerCancel}
                  onClick={() => {
                    // Con ratón el gesto ya se resolvió en `pointerup`; este click es su eco. Solo
                    // llega aquí de verdad Enter o Espacio.
                    if (clickFromPointerRef.current) {
                      clickFromPointerRef.current = false;
                      return;
                    }
                    setChatCollapsedAndPersist(true);
                  }}
                  className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 grid h-9 w-5 cursor-col-resize place-items-center rounded-full bg-surface-muted text-muted ring-1 ring-border-strong transition hover:bg-brand hover:text-on-brand hover:ring-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {/* La flecha dice hacia dónde se va Sym al pulsar; sin ella la píldora solo se lee
                      como un tirador de redimensionar. */}
                  <Icon name="chevron-right" size={16} />
                </button>
              </div>
            )}
            <div className="h-screen min-w-0 flex-1 overflow-hidden bg-surface" hidden={symCollapsed}>
              {chat}
            </div>
            {symCollapsed && (
              // Rail de Sym: presencia y restaurar, nada más. Historial, papelera y composer necesitan
              // la superficie entera y no se ofrecen aquí (§11.8).
              <div
                className="flex h-screen shrink-0 flex-col items-center gap-3 border-border border-l bg-surface py-3"
                style={{ width: CHAT_RAIL_PX }}
              >
                <SymAvatar size={28} />
                <button
                  type="button"
                  aria-label="Mostrar a Sym"
                  title="Mostrar a Sym"
                  onClick={() => setChatCollapsedAndPersist(false)}
                  className="grid size-8 place-items-center rounded-sm text-muted transition hover:bg-surface-muted hover:text-heading active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Icon name="chevron-left" size={16} />
                </button>
              </div>
            )}
          </>
        ) : hasMaterial ? (
          // El viewport no admite los dos mínimos: se prioriza lo que el alumno abrió explícitamente
          // (adaptación mínima, no la selección de superficie completa que llega en P3).
          <div className="h-screen min-w-0 flex-1 overflow-hidden bg-canvas">
            {material({
              focusMode,
              onToggleFocusMode: toggleFocusMode,
              foldAll,
              // Sin split, Sym no está plegado: no hay nada que desplegar.
              onRevealChat: () => {}
            })}
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

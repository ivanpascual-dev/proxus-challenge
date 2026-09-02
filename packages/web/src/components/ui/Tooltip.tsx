import { cloneElement, isValidElement, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { placeTooltip, type TooltipPlacement } from "../../domain/ui/tooltip-placement.ts";

// Aparece con hover y con foco, nunca contiene acciones (fase 5, §4.2): es texto, no otro control.
// Envuelve un único hijo focusable y le inyecta `aria-describedby` hacia el propio tooltip, así un
// lector de pantalla lo anuncia también al llegar por teclado, no solo al pasar el ratón por encima.
//
// Plan de correcciones §4.2.7 / C5-12: la burbuja se monta en un portal a `document.body` con
// `position: fixed`, así ningún `overflow-hidden` de un ancestro la recorta. `placeTooltip` la centra,
// la vuelca arriba o abajo y la mantiene dentro del viewport; se recalcula en `resize` y en `scroll`
// (con captura, porque puede moverse un ancestro con scroll propio) mientras está visible.

interface TooltipProps {
  readonly label: string;
  readonly children: ReactElement;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [placement, setPlacement] = useState<TooltipPlacement | null>(null);
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const child = isValidElement<{ readonly "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": id })
    : children;

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const measure = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const bubble = bubbleRef.current?.getBoundingClientRect();
      if (trigger === undefined || bubble === undefined) {
        return;
      }
      setPlacement(placeTooltip(
        { top: trigger.top, left: trigger.left, width: trigger.width, height: trigger.height },
        { width: bubble.width, height: bubble.height },
        { width: window.innerWidth, height: window.innerHeight }
      ));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [visible, label]);

  const hide = () => {
    setVisible(false);
    setPlacement(null);
  };

  // Dónde se monta la burbuja. `document.body` sirve para todo menos para un `<dialog>` abierto con
  // `showModal()`: ese vive en la top layer del navegador, que está por encima de TODO el contenido
  // normal del documento y donde el z-index no participa. Un tooltip portalizado al body se pintaba
  // entonces por detrás del diálogo, que es justo donde no se puede leer. Montándolo dentro del
  // propio diálogo entra en la misma capa. Se resuelve al hacerse visible, cuando el trigger lleva
  // renders montado, así que el ref ya apunta a algo.
  const portalTarget = (): Element =>
    triggerRef.current?.closest("dialog[open]") ?? document.body;

  return (
    <span
      ref={triggerRef}
      className="inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={hide}
      onFocus={() => setVisible(true)}
      onBlur={hide}
    >
      {child}
      {visible && createPortal(
        <div
          ref={bubbleRef}
          id={id}
          role="tooltip"
          // `break-words`: el label suele llevar dentro un nombre de fichero o de material, que
          // puede no tener ningún punto de corte. Sin esto el texto se salía de la burbuja por la
          // derecha y se leía encima de lo que hubiera detrás, `maxWidth` incluido.
          className="pointer-events-none fixed z-50 break-words bg-heading px-2 py-1 text-canvas text-xs"
          style={{
            top: placement?.top ?? 0,
            left: placement?.left ?? 0,
            maxWidth: "min(320px, calc(100vw - 16px))",
            // Antes de la primera medición se monta oculto para no dar un salto desde la esquina 0,0.
            visibility: placement === null ? "hidden" : "visible"
          }}
        >
          {label}
        </div>,
        portalTarget()
      )}
    </span>
  );
}

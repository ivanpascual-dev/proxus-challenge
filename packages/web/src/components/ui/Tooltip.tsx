import { cloneElement, isValidElement, useId, useState, type ReactElement } from "react";

// Aparece con hover y con foco, nunca contiene acciones (fase 5, §4.2): es texto, no otro control.
// Envuelve un único hijo focusable y le inyecta `aria-describedby` hacia el propio tooltip, así un
// lector de pantalla lo anuncia también al llegar por teclado, no solo al pasar el ratón por encima.

interface TooltipProps {
  readonly label: string;
  readonly children: ReactElement;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const child = isValidElement<{ readonly "aria-describedby"?: string }>(children)
    ? cloneElement(children, { "aria-describedby": id })
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {child}
      <span id={id} role="tooltip" hidden={!visible} className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 whitespace-nowrap rounded-md bg-heading px-2 py-1 text-canvas text-xs">
        {label}
      </span>
    </span>
  );
}

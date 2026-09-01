import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon.tsx";
import { Tooltip } from "./Tooltip.tsx";

// Botón con label obligatorio y tooltip (fase 5, §4.2): un icono nunca es accionable sin nombre
// accesible. El label sirve de `aria-label` y de texto del tooltip a la vez, así no pueden divergir.

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  readonly icon: IconName;
  readonly label: string;
  readonly size?: 16 | 18;
  readonly pressed?: boolean;
}

export function IconButton({ icon, label, size = 16, pressed, className = "", ...rest }: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        className={`grid size-8 place-items-center rounded-[8px] text-muted transition hover:bg-surface-muted hover:text-heading focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 ${pressed === true ? "bg-brand-soft text-brand" : ""} ${className}`}
        {...rest}
      >
        <Icon name={icon} size={size} />
      </button>
    </Tooltip>
  );
}

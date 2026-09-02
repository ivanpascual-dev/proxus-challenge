import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type ActionButtonVariant = "primary" | "brand" | "neutral" | "danger" | "selected";
export type ActionButtonSize = "default" | "compact";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon: IconName;
  readonly variant?: ActionButtonVariant;
  readonly size?: ActionButtonSize;
  readonly children: ReactNode;
  // Clases para la etiqueta, no para el botón. Sirve para esconderla en un contenedor estrecho y
  // dejar el control en solo icono; quien la esconda tiene que dar `aria-label`, o el botón se queda
  // sin nombre accesible.
  readonly labelClassName?: string;
}

const VARIANT_CLASSES: Record<ActionButtonVariant, string> = {
  primary: "border-brand bg-brand text-on-brand hover:brightness-105",
  brand: "border-transparent text-brand hover:bg-brand-soft",
  neutral: "border-border-strong text-body hover:border-brand hover:bg-surface-muted hover:text-heading",
  danger: "border-transparent text-danger-ink hover:border-danger/40 hover:bg-danger/10",
  selected: "border-brand bg-brand-soft text-heading",
};

const SIZE_CLASSES: Record<ActionButtonSize, string> = {
  default: "min-h-10 gap-2 px-3.5 text-sm",
  compact: "min-h-8 gap-1.5 px-2.5 text-xs",
};

export function ActionButton({
  icon,
  variant = "neutral",
  size = "default",
  className = "",
  children,
  labelClassName = "",
  type = "button",
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-md border font-medium transition active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      <Icon name={icon} size={size === "compact" ? 16 : 18} />
      <span className={labelClassName}>{children}</span>
    </button>
  );
}

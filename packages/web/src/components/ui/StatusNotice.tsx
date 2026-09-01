import type { ReactNode } from "react";
import { Icon } from "./Icon.tsx";
import type { NoticeTone } from "../../lib/user-feedback.ts";

// Info, success, warning y danger con icono y texto (fase 5, §4.2). Una sola procedencia visual para
// todo aviso de estado: `toUserNotice` decide el tono y el texto, este componente solo lo pinta.

const TONE_STYLE: Record<NoticeTone, { readonly icon: "info" | "check-circle" | "warning"; readonly classes: string }> = {
  info: { icon: "info", classes: "border-border-strong/40 bg-surface-muted text-body" },
  success: { icon: "check-circle", classes: "border-success/40 bg-success/10 text-success-ink" },
  warning: { icon: "warning", classes: "border-warning/40 bg-warning/10 text-warning-ink" },
  danger: { icon: "warning", classes: "border-danger/40 bg-danger/10 text-danger-ink" }
};

interface StatusNoticeProps {
  readonly tone: NoticeTone;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function StatusNotice({ tone, title, description, action }: StatusNoticeProps) {
  const { icon, classes } = TONE_STYLE[tone];
  return (
    <div className={`flex items-start gap-2.5 border p-3 text-sm ${classes}`}>
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        {description !== undefined && <p className="mt-0.5 opacity-90">{description}</p>}
        {action !== undefined && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

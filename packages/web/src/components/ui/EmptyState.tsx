import type { ReactNode } from "react";

// Título, texto y una acción opcional (fase 5, §4.2). El estado vacío de éxito ("aún no hay nada")
// nunca lo reutiliza `no data` (fallo o dato no disponible): ese caso usa `StatusNotice`.

interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="grid place-items-center gap-2 border border-border border-dashed p-8 text-center">
      <p className="font-semibold text-heading">{title}</p>
      {description !== undefined && <p className="max-w-sm text-muted text-sm">{description}</p>}
      {action !== undefined && <div className="mt-2">{action}</div>}
    </div>
  );
}

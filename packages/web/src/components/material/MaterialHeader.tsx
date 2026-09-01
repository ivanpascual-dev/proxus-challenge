import type { ReactNode } from "react";
import { Icon } from "../ui/Icon.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { ActionButton } from "../ui/ActionButton.tsx";

// Cabecera de 64px (fase 5, §4.5): título, páginas, estado, siguiente paso, progreso y cerrar.
interface MaterialHeaderProps {
  readonly title: string;
  readonly pageCount: number;
  readonly indexed: boolean;
  readonly onClose: () => void;
  readonly nextStudyAction: ReactNode;
  readonly onOpenProgress: () => void;
}

export function MaterialHeader({
  title,
  pageCount,
  indexed,
  onClose,
  nextStudyAction,
  onOpenProgress,
}: MaterialHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
      <div className="min-w-0">
        <h2 className="truncate font-semibold text-heading text-lg leading-tight">{title}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-muted text-xs">
          <Icon
            name={indexed ? "check-circle" : "warning"}
            size={16}
            className={indexed ? "text-success-ink" : "text-warning-ink"}
          />
          {pageCount} {pageCount === 1 ? "página" : "páginas"} · {indexed ? "indexado" : "sin indexar"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {nextStudyAction}
        <ActionButton
          icon="progress"
          size="compact"
          onClick={onOpenProgress}
        >
          Ver progreso
        </ActionButton>
        <IconButton icon="close" label="Cerrar material" onClick={onClose} />
      </div>
    </header>
  );
}

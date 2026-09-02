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
  // Plegar todo: barra lateral y Sym a la vez, para leer el material a solas. El estado lo posee
  // `AppShell`; aquí solo se pinta el control y se dice en qué estado está.
  readonly focusMode: boolean;
  readonly onToggleFocusMode: () => void;
}

export function MaterialHeader({
  title,
  pageCount,
  indexed,
  onClose,
  nextStudyAction,
  onOpenProgress,
  focusMode,
  onToggleFocusMode,
}: MaterialHeaderProps) {
  return (
    // Contenedor con nombre: en el mínimo de 420px que promete F5-03 el grupo de acciones pedía
    // 413px, se comía el título entero y sacaba scroll horizontal. Por debajo de 470px `Plegar todo`
    // y `Ver progreso` se quedan en solo icono (con `aria-label` y tooltip, así que no pierden
    // nombre); `Siguiente paso` conserva su texto porque es el que mueve el estudio.
    <header className="@container/material-header flex h-16 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
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
        {/* Pegado al siguiente paso, no centrado en la cabecera: así el grupo de acciones queda
            entero y nada compite por el hueco del título (feedback de Iván). */}
        <ActionButton
          icon={focusMode ? "zoom-out" : "fit-width"}
          size="compact"
          variant={focusMode ? "selected" : "neutral"}
          aria-pressed={focusMode}
          aria-label={focusMode ? "Desplegar todo" : "Plegar todo"}
          title={focusMode ? "Desplegar todo" : "Plegar todo"}
          labelClassName="@max-[470px]/material-header:hidden"
          onClick={onToggleFocusMode}
        >
          {focusMode ? "Desplegar todo" : "Plegar todo"}
        </ActionButton>
        {nextStudyAction}
        <ActionButton
          icon="progress"
          size="compact"
          aria-label="Ver progreso"
          title="Ver progreso"
          labelClassName="@max-[470px]/material-header:hidden"
          onClick={onOpenProgress}
        >
          Ver progreso
        </ActionButton>
        <IconButton icon="close" label="Cerrar material" onClick={onClose} />
      </div>
    </header>
  );
}

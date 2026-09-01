import { Icon } from "../ui/Icon.tsx";
import { IconButton } from "../ui/IconButton.tsx";

// Cabecera de 64px (fase 5, §4.5): título, páginas, estado y cerrar. `Siguiente paso` y `Ver
// progreso` llegan cuando existan `NextStudyAction` (P2) y el panel de progreso como diálogo propio
// (P1, §4.9): añadirlos ahora sería comportamiento nuevo sin la lógica que lo sostiene.
interface MaterialHeaderProps {
  readonly title: string;
  readonly pageCount: number;
  readonly indexed: boolean;
  readonly onClose: () => void;
}

export function MaterialHeader({ title, pageCount, indexed, onClose }: MaterialHeaderProps) {
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
      <IconButton icon="close" label="Cerrar material" onClick={onClose} />
    </header>
  );
}

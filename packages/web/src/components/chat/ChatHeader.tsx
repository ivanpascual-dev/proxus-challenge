import { IconButton } from "../ui/IconButton.tsx";

// Cabecera de 56px (fase 5, §4.4): "Sym", descriptor "Tutor académico", historial y papelera. No dice
// que la sesión sea efímera ni muestra proveedor, modelo o tecnología (decisión 21).
interface ChatHeaderProps {
  readonly historyToggleId: string;
  readonly historyOpen: boolean;
  readonly onToggleHistory: () => void;
  readonly onCreateNew: () => void;
  readonly onDeleteConversation: () => void;
  readonly deleting: boolean;
  // Un borrador local todavía no es una conversación: no hay nada que vaciar (C5-08) ni ninguna
  // conversación nueva que empezar, ya se está en una.
  readonly createDisabled?: boolean;
  readonly deleteDisabled?: boolean;
}

export function ChatHeader({ historyToggleId, historyOpen, onToggleHistory, onCreateNew, onDeleteConversation, deleting, createDisabled = false, deleteDisabled = false }: ChatHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-heading text-base leading-tight">Sym</p>
        <p className="text-muted text-xs leading-tight">Tutor académico</p>
      </div>
      <div className="flex items-center gap-1">
        <IconButton
          icon="plus"
          label="Nueva conversación"
          onClick={onCreateNew}
          disabled={createDisabled}
        />
        <IconButton
          id={historyToggleId}
          icon="history"
          label="Historial de conversaciones"
          pressed={historyOpen}
          onClick={onToggleHistory}
        />
        <IconButton
          icon="trash"
          label="Vaciar esta conversación"
          onClick={onDeleteConversation}
          disabled={deleting || deleteDisabled}
        />
      </div>
    </header>
  );
}

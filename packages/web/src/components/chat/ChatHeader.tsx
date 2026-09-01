import { IconButton } from "../ui/IconButton.tsx";

// Cabecera de 56px (fase 5, §4.4): "Sym", descriptor "Tutor académico", historial y papelera. No dice
// que la sesión sea efímera ni muestra proveedor, modelo o tecnología (decisión 21).
interface ChatHeaderProps {
  readonly historyToggleId: string;
  readonly historyOpen: boolean;
  readonly onToggleHistory: () => void;
  readonly onDeleteConversation: () => void;
  readonly deleting: boolean;
}

export function ChatHeader({ historyToggleId, historyOpen, onToggleHistory, onDeleteConversation, deleting }: ChatHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b px-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-heading text-base leading-tight">Sym</p>
        <p className="text-muted text-xs leading-tight">Tutor académico</p>
      </div>
      <div className="flex items-center gap-1">
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
          disabled={deleting}
        />
      </div>
    </header>
  );
}

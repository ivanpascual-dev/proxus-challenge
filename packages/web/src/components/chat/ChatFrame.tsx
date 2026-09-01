import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatContextRef } from "@proxus/shared";
import { ChatComposer } from "./ChatComposer.tsx";
import { ChatHeader } from "./ChatHeader.tsx";
import { ConversationDrawer } from "./ConversationDrawer.tsx";
import { ContextBar } from "./ContextBar.tsx";

const HISTORY_TOGGLE_ID = "chat-history-toggle";

// La cáscara compartida del chat (plan de correcciones §4.2.5): cabecera, drawer del historial, zona
// de mensajes, contexto visible y composer. La montan por igual el borrador local
// (`DraftConversation`) y la conversación guardada (`StoredConversation`), para que el borrador no sea
// una pantalla especial sin historial. Aquí solo vive el estado puramente de interfaz: si el drawer
// está abierto y a quién devolver el foco al cerrarlo (§4.11).
interface ChatFrameProps {
  readonly activeId: string | undefined;
  readonly onSelectConversation: (conversationId: string) => void;
  readonly onCreateNew: () => void;
  readonly onDeleteConversation: (conversationId: string, title: string) => void;
  readonly creating: boolean;
  readonly deletingId: string | null;
  // Vaciar la conversación activa desde la cabecera. `undefined` en el borrador: no hay nada que vaciar.
  readonly onDeleteActive: (() => void) | undefined;
  readonly deletingActive: boolean;
  readonly error: string | undefined;
  readonly historyWarning: string | undefined;
  readonly activeContext: readonly ChatContextRef[];
  readonly onRemoveContext: (ref: ChatContextRef) => void;
  readonly input: string;
  readonly onChangeInput: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly composerDisabled: boolean;
  // Impide escribir, no solo enviar: se usa cuando ya no se puede empezar la conversación.
  readonly composerBlocked?: boolean;
  // Aviso persistente sobre el chat (no un error de un envío): hoy solo el tope de `maxConversations`,
  // mostrado por adelantado mientras el chat es un borrador que no va a poder crearse (C5-09).
  readonly limitNotice?: string | undefined;
  readonly children: ReactNode;
}

export function ChatFrame({
  activeId,
  onSelectConversation,
  onCreateNew,
  onDeleteConversation,
  creating,
  deletingId,
  onDeleteActive,
  deletingActive,
  error,
  historyWarning,
  activeContext,
  onRemoveContext,
  input,
  onChangeInput,
  onSubmit,
  composerDisabled,
  composerBlocked = false,
  limitNotice,
  children
}: ChatFrameProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const wasHistoryOpen = useRef(false);

  // §4.11: un popover no modal devuelve el foco a quien lo abrió al cerrarse.
  useEffect(() => {
    if (wasHistoryOpen.current && !historyOpen) {
      document.getElementById(HISTORY_TOGGLE_ID)?.focus();
    }
    wasHistoryOpen.current = historyOpen;
  }, [historyOpen]);

  return (
    <div className="relative flex h-screen max-h-screen min-w-0 flex-col bg-surface">
      <ChatHeader
        historyToggleId={HISTORY_TOGGLE_ID}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((current) => !current)}
        onCreateNew={() => {
          setHistoryOpen(false);
          onCreateNew();
        }}
        onDeleteConversation={() => onDeleteActive?.()}
        deleting={deletingActive}
        createDisabled={activeId === undefined}
        deleteDisabled={onDeleteActive === undefined}
      />

      <ConversationDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeId={activeId}
        onSelect={(id) => {
          setHistoryOpen(false);
          onSelectConversation(id);
        }}
        onCreateNew={() => {
          setHistoryOpen(false);
          onCreateNew();
        }}
        onDelete={(id, title) => onDeleteConversation(id, title)}
        creating={creating}
        deletingId={deletingId}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {limitNotice === undefined
          ? null
          : <p className="mx-auto mt-4 mb-0 w-[85%] max-w-5xl text-balance border border-danger/40 bg-danger/15 px-4 py-3 text-center font-semibold text-base text-danger-ink">
              {limitNotice}
            </p>}

        {/* El scroll ocupa todo el ancho para que la barra quede pegada al borde de la ventana, no
            al texto; el contenido se centra al 85% (§4.2.5, enmienda de Iván). */}
        <section className="flex flex-1 flex-col overflow-y-auto" aria-live="polite">
          <div className="mx-auto flex w-[85%] max-w-5xl flex-1 flex-col gap-4 p-6">
            {children}
          </div>
        </section>

        <div className="mx-auto w-[85%] max-w-5xl">
          {error === undefined ? null : <p className="m-0 px-4 pb-1 text-danger-ink text-sm">{error}</p>}
          {historyWarning === undefined
            ? null
            : <p className="m-0 px-4 pb-1 text-muted text-sm">{historyWarning}</p>}

          <ContextBar refs={activeContext} onRemove={onRemoveContext} />
          <ChatComposer
            value={input}
            onChange={onChangeInput}
            onSubmit={onSubmit}
            disabled={composerDisabled}
            blocked={composerBlocked}
          />
        </div>
      </div>
    </div>
  );
}

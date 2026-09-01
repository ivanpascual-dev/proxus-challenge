import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { conversationsQuery } from "../../domain/tutor/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";
import { Icon } from "../ui/Icon.tsx";
import { IconButton } from "../ui/IconButton.tsx";

// Decisión 31: el historial de conversaciones pertenece a Sym, no al sidebar global. Un panel
// temporal con búsqueda simple, nueva conversación, selección y borrado; el sidebar de 224px sigue
// dedicado únicamente a materiales. Popover no modal (§4.11): Escape lo cierra y devuelve el foco a
// quien lo abrió; un click fuera también lo cierra.
interface ConversationDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly activeId: string;
  readonly onSelect: (conversationId: string) => void;
  readonly onCreateNew: () => void;
  readonly onDelete: (conversationId: string, title: string) => void;
  readonly creating: boolean;
  readonly deletingId: string | null;
}

export function ConversationDrawer({
  open,
  onClose,
  activeId,
  onSelect,
  onCreateNew,
  onDelete,
  creating,
  deletingId
}: ConversationDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const conversations = useAtomValue(conversationsQuery);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (panelRef.current !== null && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Historial de conversaciones"
      className="absolute top-14 right-0 z-10 flex max-h-[70vh] w-80 flex-col gap-2 rounded-[10px] border border-border bg-surface p-3 shadow-lg"
    >
      <button
        type="button"
        onClick={onCreateNew}
        disabled={creating}
        className="w-full rounded-full border border-border-strong px-4 py-2 text-body text-sm hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? "Creando…" : "+ Nueva conversación"}
      </button>

      <label className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-muted text-sm">
        <Icon name="search" size={16} />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Buscar en el historial"
          className="w-full bg-transparent text-body outline-none placeholder:text-muted"
        />
      </label>

      <div className="flex-1 overflow-y-auto">
        {AsyncResult.matchWithError(conversations, {
          onInitial: () => <p className="p-2 text-muted text-sm">Cargando conversaciones…</p>,
          onError: (cause) => {
            const notice = describeFailure(cause, { area: "chat", action: "list" }, "ConversationDrawer");
            return <p className="p-2 text-danger-ink text-sm">{notice.title}</p>;
          },
          onDefect: () => <p className="p-2 text-danger-ink text-sm">{DEFECT_MESSAGE}</p>,
          onSuccess: ({ value }) => {
            const filtered = normalizedQuery.length === 0
              ? value
              : value.filter((conversation) => conversation.title.toLowerCase().includes(normalizedQuery));

            if (filtered.length === 0) {
              return (
                <p className="p-2 text-muted text-sm">
                  {value.length === 0 ? "Aún no hay conversaciones." : "Ninguna conversación coincide con la búsqueda."}
                </p>
              );
            }

            return (
              <ul className="flex flex-col gap-1">
                {filtered.map((conversation) => (
                  <li key={conversation.id} className="relative">
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className={`w-full truncate rounded-lg py-2 pr-8 pl-2.5 text-left text-sm transition ${
                        activeId === conversation.id ? "bg-brand-soft text-heading" : "text-body hover:bg-surface-muted"
                      }`}
                    >
                      {conversation.title.length > 0 ? conversation.title : "Conversación nueva"}
                    </button>
                    <span className="absolute top-0.5 right-0.5">
                      <IconButton
                        icon="trash"
                        label={`Borrar conversación "${conversation.title}"`}
                        size={16}
                        disabled={deletingId !== null}
                        onClick={() => onDelete(conversation.id, conversation.title)}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            );
          }
        })}
      </div>
    </div>
  );
}

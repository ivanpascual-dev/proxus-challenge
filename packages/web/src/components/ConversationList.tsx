import { useState } from "react";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { conversationsQuery, createConversationAction, deleteConversationAction } from "../domain/tutor/atoms.ts";
import { DEFECT_MESSAGE, messageOf } from "../lib/error-message.ts";

// Varias conversaciones, con lista, guardadas en el servidor (fase 4, decisión 6).
export function ConversationList({
  activeId,
  onSelect,
  onCreated
}: {
  readonly activeId: string | undefined;
  readonly onSelect: (conversationId: string) => void;
  readonly onCreated: (conversationId: string) => void;
}) {
  const conversations = useAtomValue(conversationsQuery);
  const createConversation = useAtomSet(createConversationAction, { mode: "promise" });
  const deleteConversation = useAtomSet(deleteConversationAction, { mode: "promise" });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const create = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      const conversation = await createConversation();
      onCreated(conversation.id);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setCreating(false);
    }
  };

  const remove = async (conversationId: string) => {
    if (deletingId !== null || !window.confirm("¿Borrar esta conversación? No se puede deshacer.")) {
      return;
    }
    setDeletingId(conversationId);
    setError(undefined);
    try {
      await deleteConversation(conversationId);
      if (activeId === conversationId) {
        await create();
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="flex h-screen flex-col overflow-y-auto border-border border-r bg-canvas p-4 max-md:h-auto max-md:max-h-[30vh]">
      <button
        type="button"
        className="mb-3 w-full rounded-full border border-border-strong px-4 py-2 text-body text-sm hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => void create()}
        disabled={creating}
      >
        {creating ? "Creando…" : "+ Nueva conversación"}
      </button>

      {error !== undefined && (
        <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 p-2 text-danger-ink text-xs">{error}</p>
      )}

      {AsyncResult.matchWithError(conversations, {
        onInitial: () => <p className="text-muted text-sm">Cargando conversaciones…</p>,
        onError: (cause) => <p className="text-danger-ink text-sm">{messageOf(cause)}</p>,
        onDefect: () => <p className="text-danger-ink text-sm">{DEFECT_MESSAGE}</p>,
        onSuccess: ({ value }) => value.length === 0
          ? <p className="text-muted text-sm">Aún no hay conversaciones.</p>
          : (
              <ul className="grid gap-1.5">
                {value.map((conversation) => (
                  <li key={conversation.id} className="relative">
                    <button
                      type="button"
                      onClick={() => onSelect(conversation.id)}
                      className={`w-full rounded-xl p-2.5 pr-9 text-left text-sm transition hover:border-brand hover:bg-surface ${
                        activeId === conversation.id
                          ? "border border-brand bg-brand-soft"
                          : "border border-transparent bg-canvas/70"
                      }`}
                    >
                      <span className="block truncate text-heading">
                        {conversation.title.length > 0 ? conversation.title : "Conversación nueva"}
                      </span>
                    </button>
                    <button
                      type="button"
                      title="Borrar conversación"
                      aria-label={`Borrar conversación "${conversation.title}"`}
                      onClick={() => void remove(conversation.id)}
                      disabled={deletingId !== null}
                      className="absolute top-2.5 right-2 rounded-full p-1 text-muted text-xs transition hover:bg-danger/10 hover:text-danger-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === conversation.id ? "…" : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
            )
      })}
    </aside>
  );
}

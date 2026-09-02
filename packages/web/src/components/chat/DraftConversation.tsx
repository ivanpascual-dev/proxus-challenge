import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { LIMITS, type ChatContextRef } from "@proxus/shared";
import { useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialsQuery } from "../../domain/materials/atoms.ts";
import { conversationsQuery, createConversationAction, deleteConversationAction } from "../../domain/tutor/atoms.ts";
import { ChatEmptyState } from "./ChatEmptyState.tsx";
import { ChatFrame } from "./ChatFrame.tsx";
import type { PendingMessage } from "./StoredConversation.tsx";
import { useDismissibleContext } from "./useDismissibleContext.ts";
import { describeFailure } from "../../lib/user-feedback.ts";

// El chat empieza como borrador local (decisión 12, C5-08): arrancar, pulsar `Nueva conversación` o
// borrar la activa no escribe en servidor. La conversación se crea al enviar el primer mensaje
// válido; hasta entonces esta pantalla no consulta ni crea nada. El drawer del historial sigue
// operativo para abrir o borrar conversaciones existentes aunque ya se haya alcanzado el límite de
// `maxConversations` (C5-09).
interface DraftConversationProps {
  readonly proposedContext: readonly ChatContextRef[];
  readonly onContextDismissed: (ref: ChatContextRef) => void;
  readonly onConversationCreated: (conversationId: string, pending: PendingMessage) => void;
  readonly onSelectConversation: (conversationId: string) => void;
}

export function DraftConversation({
  proposedContext,
  onContextDismissed,
  onConversationCreated,
  onSelectConversation
}: DraftConversationProps) {
  const createConversation = useAtomSet(createConversationAction, { mode: "promise" });
  const deleteConversation = useAtomSet(deleteConversationAction, { mode: "promise" });
  const refreshConversationList = useAtomRefresh(conversationsQuery);
  const conversations = useAtomValue(conversationsQuery);
  const materials = useAtomValue(materialsQuery);
  const { activeContext, dismiss } = useDismissibleContext(proposedContext, onContextDismissed);

  // El borrador todavía no ha escrito nada en servidor, así que puede mirar el conteo real y avisar
  // por adelantado en vez de dejar que el alumno escriba y choque contra el 400 al enviar (C5-09,
  // enmienda de Iván al probar la fase).
  const conversationCount = AsyncResult.getOrElse(conversations, () => [] as ReadonlyArray<unknown>).length;
  const atConversationLimit = conversationCount >= LIMITS.maxConversations;
  const limitNotice = atConversationLimit
    ? `Ya tienes ${conversationCount} conversaciones, el máximo es ${LIMITS.maxConversations}. Borra alguna para crear otra.`
    : undefined;
  const noMaterials = AsyncResult.getOrElse(materials, () => ({ materials: [] as ReadonlyArray<unknown> })).materials.length === 0;

  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  const submit = async (nextInput: string) => {
    const trimmed = nextInput.trim();
    if (trimmed.length === 0 || creating || atConversationLimit || trimmed.length > LIMITS.maxMessageCharacters) {
      return;
    }

    setCreating(true);
    setError(undefined);
    try {
      const conversation = await createConversation();
      refreshConversationList();
      // El composer se limpia al cambiar de pantalla, con el mensaje ya en camino: si la creación
      // falla, el texto escrito se conserva (C5-09).
      onConversationCreated(conversation.id, { input: trimmed, context: activeContext });
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "create" }, "DraftConversation");
      setError(notice.description ?? notice.title);
    } finally {
      setCreating(false);
    }
  };

  const deleteConversationById = async (id: string, title: string) => {
    if (deletingId !== null) {
      return;
    }
    const label = title.length > 0 ? `"${title}"` : "esta conversación";
    if (!window.confirm(`¿Borrar ${label}? No se puede deshacer.`)) {
      return;
    }
    setDeletingId(id);
    setError(undefined);
    try {
      await deleteConversation(id);
      refreshConversationList();
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "delete" }, "DraftConversation");
      setError(notice.description ?? notice.title);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <ChatFrame
      activeId={undefined}
      onSelectConversation={onSelectConversation}
      onCreateNew={() => setError(undefined)}
      onDeleteConversation={(id, title) => void deleteConversationById(id, title)}
      creating={creating}
      deletingId={deletingId}
      onDeleteActive={undefined}
      deletingActive={false}
      error={error}
      historyWarning={undefined}
      activeContext={activeContext}
      onRemoveContext={dismiss}
      input={input}
      onChangeInput={setInput}
      onSubmit={(value) => void submit(value)}
      composerDisabled={creating}
      composerBlocked={atConversationLimit}
      limitNotice={limitNotice}
    >
      <ChatEmptyState
        onSelect={(prompt) => void submit(prompt)}
        showUploadHint={noMaterials}
        blocked={atConversationLimit}
      />
    </ChatFrame>
  );
}

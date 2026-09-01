import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { LIMITS, type ChatContextRef } from "@proxus/shared";
import { useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { invalidateArtifactsAction } from "../domain/artifacts/atoms.ts";
import { materialsQuery } from "../domain/materials/atoms.ts";
import { conversationQuery, conversationsQuery, createConversationAction, deleteConversationAction } from "../domain/tutor/atoms.ts";
import { applyInvalidations, invalidationsForToolCall } from "../domain/tutor/invalidation.ts";
import { streamTutorMessage } from "../domain/tutor/stream.ts";
import {
  applyMessageToTurnView,
  emptyTurnView,
  turnViewsFromConversation,
  withFollowUpQuestions,
  withTurnFailure,
  type TurnView
} from "../domain/tutor/turn-view.ts";
import { ChatComposer } from "./chat/ChatComposer.tsx";
import { ChatEmptyState } from "./chat/ChatEmptyState.tsx";
import { ChatHeader } from "./chat/ChatHeader.tsx";
import { ConversationDrawer } from "./chat/ConversationDrawer.tsx";
import { ContextBar, contextRefKey } from "./chat/ContextBar.tsx";
import { MessageList } from "./chat/MessageList.tsx";
import { DEFECT_MESSAGE, describeFailure } from "../lib/user-feedback.ts";

const HISTORY_TOGGLE_ID = "chat-history-toggle";

export function Chat({ proposedContext }: { readonly proposedContext: readonly ChatContextRef[] }) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversationError, setConversationError] = useState<string | undefined>();
  const createConversation = useAtomSet(createConversationAction, { mode: "promise" });

  // La sesión vive en el servidor (fase 4, decisión 6): hace falta una conversación antes de mandar
  // el primer mensaje. Se crea una al arrancar; después el alumno cambia de conversación desde el
  // historial de `ChatHeader` (decisión 31: ya no vive en el sidebar global).
  useEffect(() => {
    let cancelled = false;
    createConversation()
      .then((conversation) => {
        if (!cancelled) {
          setConversationId(conversation.id);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const notice = describeFailure(cause, { area: "chat", action: "create" }, "Chat");
          setConversationError(notice.description ?? notice.title);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (conversationId === undefined) {
    return (
      <main className="grid h-screen place-items-center bg-canvas">
        {conversationError === undefined
          ? <p className="text-muted">Preparando conversación…</p>
          : <p className="text-danger-ink">No se pudo preparar la conversación: {conversationError}</p>}
      </main>
    );
  }

  return (
    <ChatConversation
      key={conversationId}
      conversationId={conversationId}
      onSwitchConversation={setConversationId}
      proposedContext={proposedContext}
    />
  );
}

function ChatConversation({
  conversationId,
  onSwitchConversation,
  proposedContext
}: {
  readonly conversationId: string;
  readonly onSwitchConversation: (conversationId: string) => void;
  readonly proposedContext: readonly ChatContextRef[];
}) {
  const detail = useAtomValue(conversationQuery(conversationId));
  const refreshConversationList = useAtomRefresh(conversationsQuery);
  const createConversation = useAtomSet(createConversationAction, { mode: "promise" });
  const deleteConversation = useAtomSet(deleteConversationAction, { mode: "promise" });

  const [turns, setTurns] = useState<readonly TurnView[] | undefined>(undefined);
  const [liveTurn, setLiveTurn] = useState<TurnView | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [historyWarning, setHistoryWarning] = useState<string | undefined>();
  const [dismissedContextKeys, setDismissedContextKeys] = useState<ReadonlySet<string>>(new Set());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const invalidateArtifacts = useAtomSet(invalidateArtifactsAction);
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const pendingInvalidations = useRef<Array<ReturnType<typeof invalidationsForToolCall>>>([]);
  const wasHistoryOpen = useRef(false);

  // Hidrata el historial una sola vez, al cargar la conversación: los turnos en vivo se acumulan
  // aparte (`liveTurn`) para no perder lo que se está enviando si la consulta se refresca de fondo.
  useEffect(() => {
    if (turns !== undefined) {
      return;
    }
    AsyncResult.match(detail, {
      onSuccess: ({ value }) => setTurns(turnViewsFromConversation(value)),
      onFailure: () => setTurns([]),
      onInitial: () => {}
    });
  }, [detail, turns]);

  // §4.11: un popover no modal devuelve el foco a quien lo abrió al cerrarse.
  useEffect(() => {
    if (wasHistoryOpen.current && !historyOpen) {
      document.getElementById(HISTORY_TOGGLE_ID)?.focus();
    }
    wasHistoryOpen.current = historyOpen;
  }, [historyOpen]);

  // El contexto de pantalla se propone solo y se puede quitar (decisión 5): al cambiar de material,
  // artefacto o bloque, la propuesta se recalcula y lo que se había quitado deja de aplicar.
  const proposedContextKey = proposedContext.map(contextRefKey).join("|");
  useEffect(() => {
    setDismissedContextKeys(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedContextKey]);

  const activeContext = proposedContext.filter((ref) => !dismissedContextKeys.has(contextRefKey(ref)));

  const submit = async (nextInput: string) => {
    const trimmed = nextInput.trim();
    if (trimmed.length === 0 || isSending || trimmed.length > LIMITS.maxMessageCharacters) {
      return;
    }

    setIsSending(true);
    setError(undefined);
    setHistoryWarning(undefined);
    setInput("");
    pendingInvalidations.current = [];

    let workingTurn = emptyTurnView(trimmed, activeContext);
    setLiveTurn(workingTurn);

    try {
      for await (const event of streamTutorMessage({
        conversationId,
        input: trimmed,
        context: activeContext,
        maxSteps: LIMITS.maxAgentSteps
      })) {
        if (event.type === "done") {
          continue;
        }

        if (event.type === "error") {
          workingTurn = withTurnFailure(workingTurn, event.message);
          setLiveTurn(workingTurn);
          setError(event.message);
          continue;
        }

        // El aviso al 75% de `maxConversationHistoryTokens`: informativo, la conversación sigue
        // usable, solo sugiere empezar una nueva cuando convenga.
        if (event.type === "warning") {
          setHistoryWarning(event.message);
          continue;
        }

        if (event.type === "usage") {
          continue;
        }

        if (event.type === "follow-up") {
          workingTurn = withFollowUpQuestions(workingTurn, event.questions);
          setLiveTurn(workingTurn);
          continue;
        }

        const message = event.message;
        if (message.role === "tool-call") {
          pendingInvalidations.current.push(invalidationsForToolCall(message));
        }
        if (message.role === "tool-result") {
          const keys = pendingInvalidations.current.shift() ?? [];
          if (!message.isFailure) {
            applyInvalidations(keys, {
              invalidateArtifacts: () => invalidateArtifacts(),
              refreshMaterials
            });
          }
        }

        workingTurn = applyMessageToTurnView(workingTurn, message);
        setLiveTurn(workingTurn);
      }

      setTurns((current) => [...(current ?? []), workingTurn]);
      setLiveTurn(null);
      refreshConversationList();
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "send" }, "Chat");
      setError(notice.description ?? notice.title);
      setTurns((current) => [...(current ?? []), withTurnFailure(workingTurn, notice.description ?? notice.title)]);
      setLiveTurn(null);
    } finally {
      setIsSending(false);
    }
  };

  const createNewConversation = async () => {
    if (creatingConversation) {
      return;
    }
    setCreatingConversation(true);
    setError(undefined);
    try {
      const conversation = await createConversation();
      refreshConversationList();
      setHistoryOpen(false);
      onSwitchConversation(conversation.id);
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "create" }, "Chat");
      setError(notice.description ?? notice.title);
    } finally {
      setCreatingConversation(false);
    }
  };

  // Decisión 25: vaciar el chat es borrar la conversación de verdad en el servidor, nunca fingirlo
  // vaciando solo el array local. Si es la conversación activa, se sustituye por una nueva vacía.
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
      if (id === conversationId) {
        setHistoryOpen(false);
        await createNewConversation();
      }
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "delete" }, "Chat");
      setError(notice.description ?? notice.title);
    } finally {
      setDeletingId(null);
    }
  };

  const currentTitle = AsyncResult.getOrElse(detail, () => undefined)?.title ?? "";
  const visibleTurns = turns ?? [];

  return (
    <div className="relative flex h-screen max-h-screen min-w-0 flex-col bg-canvas">
      <ChatHeader
        historyToggleId={HISTORY_TOGGLE_ID}
        historyOpen={historyOpen}
        onToggleHistory={() => setHistoryOpen((current) => !current)}
        onDeleteConversation={() => void deleteConversationById(conversationId, currentTitle)}
        deleting={deletingId === conversationId}
      />

      <ConversationDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeId={conversationId}
        onSelect={(id) => {
          setHistoryOpen(false);
          onSwitchConversation(id);
        }}
        onCreateNew={() => void createNewConversation()}
        onDelete={(id, title) => void deleteConversationById(id, title)}
        creating={creatingConversation}
        deletingId={deletingId}
      />

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
        <section className="flex flex-1 flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
          {AsyncResult.matchWithError(detail, {
            onInitial: () => turns === undefined ? <p className="m-auto text-muted">Cargando la conversación…</p> : null,
            onError: (cause) => {
              if (turns !== undefined) {
                return null;
              }
              const notice = describeFailure(cause, { area: "chat", action: "load" }, "Chat");
              return <p className="m-auto text-danger-ink">{notice.title} {notice.description}</p>;
            },
            onDefect: () => turns === undefined ? <p className="m-auto text-danger-ink">{DEFECT_MESSAGE}</p> : null,
            onSuccess: () => null
          })}

          {turns !== undefined && visibleTurns.length === 0 && liveTurn === null
            ? <ChatEmptyState onSelect={(prompt) => void submit(prompt)} />
            : (
                <div className="mt-auto flex w-full flex-col">
                  <MessageList
                    turns={visibleTurns}
                    liveTurn={liveTurn}
                    onSelectFollowUp={(question) => void submit(question)}
                    sending={isSending}
                  />
                </div>
              )}
        </section>

        {error === undefined ? null : <p className="m-0 px-4 pb-1 text-danger-ink text-sm">{error}</p>}
        {historyWarning === undefined
          ? null
          : <p className="m-0 px-4 pb-1 text-muted text-sm">{historyWarning}</p>}

        <ContextBar
          refs={activeContext}
          onRemove={(ref) => setDismissedContextKeys((current) => new Set(current).add(contextRefKey(ref)))}
        />
        <ChatComposer value={input} onChange={setInput} onSubmit={(value) => void submit(value)} disabled={isSending} />
      </div>
    </div>
  );
}

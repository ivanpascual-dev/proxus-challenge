import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { LIMITS, type ChatContextRef } from "@proxus/shared";
import { useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { invalidateArtifactsAction } from "../../domain/artifacts/atoms.ts";
import { materialsQuery } from "../../domain/materials/atoms.ts";
import { conversationQuery, conversationsQuery, deleteConversationAction } from "../../domain/tutor/atoms.ts";
import { applyInvalidations, invalidationsForToolCall } from "../../domain/tutor/invalidation.ts";
import { streamTutorMessage } from "../../domain/tutor/stream.ts";
import {
  applyMessageToTurnView,
  emptyTurnView,
  turnViewsFromConversation,
  withFollowUpQuestions,
  withTurnFailure,
  type TurnView
} from "../../domain/tutor/turn-view.ts";
import { ChatEmptyState } from "./ChatEmptyState.tsx";
import { ChatFrame } from "./ChatFrame.tsx";
import { MessageList } from "./MessageList.tsx";
import { useDismissibleContext } from "./useDismissibleContext.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../lib/user-feedback.ts";

// El primer mensaje de un borrador recién convertido en conversación: se entrega una sola vez, al
// montar (C5-08). `context` viaja explícito porque es el que el alumno tenía aceptado en el borrador,
// no el que se recalcula al montar esta pantalla.
export interface PendingMessage {
  readonly input: string;
  readonly context: readonly ChatContextRef[];
}

interface StoredConversationProps {
  readonly conversationId: string;
  readonly pending: PendingMessage | undefined;
  readonly proposedContext: readonly ChatContextRef[];
  readonly onResetToDraft: () => void;
  readonly onSelectConversation: (conversationId: string) => void;
}

export function StoredConversation({
  conversationId,
  pending,
  proposedContext,
  onResetToDraft,
  onSelectConversation
}: StoredConversationProps) {
  const detail = useAtomValue(conversationQuery(conversationId));
  const refreshConversationList = useAtomRefresh(conversationsQuery);
  const deleteConversation = useAtomSet(deleteConversationAction, { mode: "promise" });
  const materials = useAtomValue(materialsQuery);
  const noMaterials = AsyncResult.getOrElse(materials, () => ({ materials: [] as ReadonlyArray<unknown> })).materials.length === 0;

  const [turns, setTurns] = useState<readonly TurnView[] | undefined>(undefined);
  const [liveTurn, setLiveTurn] = useState<TurnView | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [historyWarning, setHistoryWarning] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { activeContext, dismiss } = useDismissibleContext(proposedContext);

  const invalidateArtifacts = useAtomSet(invalidateArtifactsAction);
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const pendingInvalidations = useRef<Array<ReturnType<typeof invalidationsForToolCall>>>([]);
  const deliveredPendingRef = useRef(false);

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

  const submit = async (nextInput: string, contextOverride?: readonly ChatContextRef[]) => {
    const trimmed = nextInput.trim();
    if (trimmed.length === 0 || isSending || trimmed.length > LIMITS.maxMessageCharacters) {
      return;
    }

    const context = contextOverride ?? activeContext;

    setIsSending(true);
    setError(undefined);
    setHistoryWarning(undefined);
    setInput("");
    pendingInvalidations.current = [];

    let workingTurn = emptyTurnView(trimmed, context);
    setLiveTurn(workingTurn);

    try {
      for await (const event of streamTutorMessage({
        conversationId,
        input: trimmed,
        context,
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
      const notice = describeFailure(cause, { area: "chat", action: "send" }, "StoredConversation");
      setError(notice.description ?? notice.title);
      setTurns((current) => [...(current ?? []), withTurnFailure(workingTurn, notice.description ?? notice.title)]);
      setLiveTurn(null);
    } finally {
      setIsSending(false);
    }
  };

  // El primer mensaje del borrador se entrega una vez, cuando esta pantalla ya está montada con la
  // conversación creada (C5-08). El `key={conversationId}` del propietario garantiza que este efecto
  // vuelve a poder disparar para la siguiente conversación.
  useEffect(() => {
    if (pending !== undefined && !deliveredPendingRef.current) {
      deliveredPendingRef.current = true;
      void submit(pending.input, pending.context);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Decisión 25: vaciar el chat es borrar la conversación de verdad en el servidor, nunca fingirlo
  // vaciando solo el array local. Si es la conversación activa, se vuelve al borrador local sin crear
  // otra en servidor (C5-08).
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
        onResetToDraft();
      }
    } catch (cause) {
      const notice = describeFailure(cause, { area: "chat", action: "delete" }, "StoredConversation");
      setError(notice.description ?? notice.title);
    } finally {
      setDeletingId(null);
    }
  };

  const currentTitle = AsyncResult.getOrElse(detail, () => undefined)?.title ?? "";
  const visibleTurns = turns ?? [];

  return (
    <ChatFrame
      activeId={conversationId}
      onSelectConversation={onSelectConversation}
      onCreateNew={onResetToDraft}
      onDeleteConversation={(id, title) => void deleteConversationById(id, title)}
      creating={false}
      deletingId={deletingId}
      onDeleteActive={() => void deleteConversationById(conversationId, currentTitle)}
      deletingActive={deletingId === conversationId}
      error={error}
      historyWarning={historyWarning}
      activeContext={activeContext}
      onRemoveContext={dismiss}
      input={input}
      onChangeInput={setInput}
      onSubmit={(value) => void submit(value)}
      composerDisabled={isSending}
    >
      {AsyncResult.matchWithError(detail, {
        onInitial: () => turns === undefined ? <p className="m-auto text-muted">Cargando la conversación…</p> : null,
        onError: (cause) => {
          if (turns !== undefined) {
            return null;
          }
          const notice = describeFailure(cause, { area: "chat", action: "load" }, "StoredConversation");
          return <p className="m-auto text-danger-ink">{notice.title} {notice.description}</p>;
        },
        onDefect: () => turns === undefined ? <p className="m-auto text-danger-ink">{DEFECT_MESSAGE}</p> : null,
        onSuccess: () => null
      })}

      {turns !== undefined && visibleTurns.length === 0 && liveTurn === null
        ? <ChatEmptyState onSelect={(prompt) => void submit(prompt)} showUploadHint={noMaterials} />
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
    </ChatFrame>
  );
}

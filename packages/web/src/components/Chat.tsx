import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import { LIMITS, type AgentMessage, type ChatContextRef } from "@proxus/shared";
import { useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { invalidateArtifactsAction } from "../domain/artifacts/atoms.ts";
import { materialsQuery } from "../domain/materials/atoms.ts";
import { conversationQuery, conversationsQuery, createConversationAction } from "../domain/tutor/atoms.ts";
import { applyInvalidations, invalidationsForToolCall } from "../domain/tutor/invalidation.ts";
import { streamTutorMessage } from "../domain/tutor/stream.ts";
import { ChatContextBar, contextRefKey } from "./ChatContextBar.tsx";
import { ConversationList } from "./ConversationList.tsx";
import { FollowUpQuestions } from "./FollowUpQuestions.tsx";
import { DEFECT_MESSAGE, messageOf } from "../lib/error-message.ts";

const starterPrompts = [
  "Lista mis materiales subidos",
  "Crea un quiz corto a partir de mis materiales",
  "Explícame paso a paso el concepto más difícil de mis apuntes"
] as const;

export function Chat({ proposedContext }: { readonly proposedContext: readonly ChatContextRef[] }) {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversationError, setConversationError] = useState<string | undefined>();
  const createConversation = useAtomSet(createConversationAction, { mode: "promise" });

  // La sesión vive en el servidor (fase 4, decisión 6): hace falta una conversación antes de mandar
  // el primer mensaje. Se crea una al arrancar; después el alumno cambia de conversación desde la
  // lista lateral (`ConversationList`).
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
          setConversationError(messageOf(cause));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid h-screen grid-cols-[220px_minmax(0,1fr)] max-md:grid-cols-1 max-md:grid-rows-[auto_1fr]">
      <ConversationList
        activeId={conversationId}
        onSelect={setConversationId}
        onCreated={setConversationId}
      />
      {conversationId === undefined
        ? (
            <main className="grid h-screen place-items-center bg-canvas">
              {conversationError === undefined
                ? <p className="text-muted">Preparando conversación…</p>
                : <p className="text-danger-ink">No se pudo preparar la conversación: {conversationError}</p>}
            </main>
          )
        : (
            <ChatConversation
              key={conversationId}
              conversationId={conversationId}
              proposedContext={proposedContext}
            />
          )}
    </div>
  );
}

function ChatConversation({
  conversationId,
  proposedContext
}: {
  readonly conversationId: string;
  readonly proposedContext: readonly ChatContextRef[];
}) {
  const detail = useAtomValue(conversationQuery(conversationId));
  const refreshConversation = useAtomRefresh(conversationQuery(conversationId));
  const refreshConversationList = useAtomRefresh(conversationsQuery);

  const [messages, setMessages] = useState<readonly AgentMessage[] | undefined>(undefined);
  const [followUpQuestions, setFollowUpQuestions] = useState<readonly string[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [historyWarning, setHistoryWarning] = useState<string | undefined>();
  const [dismissedContextKeys, setDismissedContextKeys] = useState<ReadonlySet<string>>(new Set());
  const invalidateArtifacts = useAtomSet(invalidateArtifactsAction);
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const pendingInvalidations = useRef<Array<ReturnType<typeof invalidationsForToolCall>>>([]);

  // Hidrata el historial una sola vez, al cargar la conversación: los turnos en vivo se acumulan
  // aparte para no perder lo que se está enviando si el detalle se refresca de fondo.
  useEffect(() => {
    if (messages !== undefined) {
      return;
    }
    AsyncResult.match(detail, {
      onSuccess: ({ value }) => {
        setMessages(value.messages);
      },
      onFailure: () => setMessages([]),
      onInitial: () => {}
    });
  }, [detail, messages]);

  // El contexto de pantalla se propone solo y se puede quitar (decisión 5): al cambiar de material,
  // artefacto o bloque, la propuesta se recalcula y lo que se había quitado deja de aplicar.
  const proposedContextKey = proposedContext.map(contextRefKey).join("|");
  useEffect(() => {
    setDismissedContextKeys(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedContextKey]);

  const activeContext = proposedContext.filter((ref) => !dismissedContextKeys.has(contextRefKey(ref)));

  const overMessageLimit = input.length > LIMITS.maxMessageCharacters;

  const submit = async (nextInput: string) => {
    const trimmed = nextInput.trim();
    if (trimmed.length === 0 || isSending || trimmed.length > LIMITS.maxMessageCharacters) {
      return;
    }

    setIsSending(true);
    setError(undefined);
    setHistoryWarning(undefined);
    setFollowUpQuestions([]);
    pendingInvalidations.current = [];

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
          setFollowUpQuestions(event.questions);
          continue;
        }

        const message = event.message;
        setMessages((current) => [...(current ?? []), message]);

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
      }

      setInput("");
      refreshConversation();
      refreshConversationList();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setIsSending(false);
    }
  };

  const visibleMessages = messages ?? [];

  return (
    <main className="grid h-screen max-h-screen min-w-0 grid-rows-[auto_auto_1fr_auto_auto_auto] bg-canvas max-md:h-auto max-md:max-h-none">
      <header className="flex items-center justify-between gap-4 border-border border-b px-6 py-5">
        <div>
          <h1 className="m-0 font-bold text-3xl text-heading">Tutor académico</h1>
        </div>
      </header>

      <ChatContextBar
        refs={activeContext}
        onRemove={(ref) => setDismissedContextKeys((current) => new Set(current).add(contextRefKey(ref)))}
      />

      <section className="flex flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
        {AsyncResult.matchWithError(detail, {
          onInitial: () => messages === undefined ? <p className="m-auto text-muted">Cargando la conversación…</p> : null,
          onError: (cause) => messages === undefined ? <p className="m-auto text-danger-ink">No se pudo cargar la conversación: {messageOf(cause)}</p> : null,
          onDefect: () => messages === undefined ? <p className="m-auto text-danger-ink">{DEFECT_MESSAGE}</p> : null,
          onSuccess: () => null
        })}
        {messages !== undefined && visibleMessages.length === 0
          ? (
              <div className="m-auto w-full max-w-3xl text-center">
                <h2 className="m-0 text-balance font-bold text-4xl text-heading leading-tight md:text-6xl">
                  Pregunta por tus materiales, apuntes, quizzes o tests.
                </h2>
                <div className="mt-6 grid grid-cols-3 gap-3 max-lg:grid-cols-1">
                  {starterPrompts.map((prompt) => (
                    <button
                      className="rounded-2xl border border-border-strong bg-surface p-4 text-body hover:border-brand"
                      key={prompt}
                      type="button"
                      onClick={() => void submit(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )
          : visibleMessages.map((message, index) => <MessageBubble key={index} message={message} />)}
      </section>

      <FollowUpQuestions
        questions={followUpQuestions}
        onSelect={(question) => void submit(question)}
        disabled={isSending}
      />

      {error === undefined ? null : <p className="m-0 px-6 pb-3 text-danger-ink">{error}</p>}
      {historyWarning === undefined
        ? null
        : <p className="m-0 flex flex-wrap items-center gap-2 px-6 pb-3 text-muted">{historyWarning}</p>}

      <form
        className="grid grid-cols-[1fr_auto] gap-3 border-border border-t bg-canvas/90 px-6 pt-4 pb-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <textarea
            className={`w-full resize-y rounded-2xl border bg-surface px-4 py-3 text-heading outline-none focus:border-transparent focus:ring-2 ${
              overMessageLimit ? "border-danger focus:ring-danger" : "border-border-strong focus:ring-brand"
            }`}
            value={input}
            onChange={(event) => setInput(event.currentTarget.value)}
            placeholder="Pregúntale algo a tu tutor…"
            rows={3}
            aria-invalid={overMessageLimit}
          />
          <p
            className={`self-end text-xs ${overMessageLimit ? "text-danger-ink" : "text-muted"}`}
            aria-live="polite"
          >
            {overMessageLimit
              ? `${input.length} / ${LIMITS.maxMessageCharacters} caracteres: pasa del máximo`
              : `${input.length} / ${LIMITS.maxMessageCharacters}`}
          </p>
        </div>
        <button
          className="self-start rounded-full border border-border-strong bg-surface px-5 py-3 text-heading hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={isSending || input.trim().length === 0 || overMessageLimit}
        >
          {isSending ? "Pensando…" : "Enviar"}
        </button>
      </form>
    </main>
  );
}

function MessageBubble({ message }: { readonly message: AgentMessage }) {
  if (message.role === "tool-call" || message.role === "tool-result") {
    return (
      <details className="w-full rounded-2xl border border-border bg-canvas p-4 text-muted">
        <summary className="cursor-pointer">
          {message.role === "tool-call" ? `Llamada a herramienta: ${message.name}` : `Resultado de herramienta: ${message.name}`}
        </summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm">
          {JSON.stringify(message.role === "tool-call" ? message.input : message.result, null, 2)}
        </pre>
      </details>
    );
  }

  return (
    <article className={message.role === "user"
      ? "max-w-3xl self-end rounded-2xl border border-brand/40 bg-brand-soft p-4"
      : "max-w-3xl self-start rounded-2xl border border-border bg-surface p-4"}
    >
      <span className="mb-2 block font-bold text-brand text-xs uppercase tracking-wide">
        {message.role === "user" ? "Tú" : "Tutor"}
      </span>
      <div className="text-heading leading-7">
        <Streamdown>{message.content}</Streamdown>
      </div>
    </article>
  );
}

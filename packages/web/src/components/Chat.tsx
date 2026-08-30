import { useAtomRefresh, useAtomSet } from "@effect/atom-react";
import { LIMITS, type AgentMessage } from "@proxus/shared";
import { useRef, useState } from "react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { invalidateArtifactsAction } from "../domain/artifacts/atoms.ts";
import { materialsQuery } from "../domain/materials/atoms.ts";
import { applyInvalidations, invalidationsForToolCall } from "../domain/tutor/invalidation.ts";
import { streamTutorMessage } from "../domain/tutor/stream.ts";

const starterPrompts = [
  "Lista mis materiales subidos",
  "Crea un quiz corto a partir de mis materiales",
  "Explícame paso a paso el concepto más difícil de mis apuntes"
] as const;

export function Chat() {
  const [messages, setMessages] = useState<readonly AgentMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const invalidateArtifacts = useAtomSet(invalidateArtifactsAction);
  const refreshMaterials = useAtomRefresh(materialsQuery);
  const pendingInvalidations = useRef<Array<ReturnType<typeof invalidationsForToolCall>>>([]);

  // El techo lo impone el servidor en voz alta (F1-02); el contador es la cortesía que evita mandar
  // un mensaje que ya se sabe que va a rebotar. La cifra sale de LIMITS, nunca escrita a mano (F1-09).
  const overMessageLimit = input.length > LIMITS.maxMessageCharacters;

  const submit = async (nextInput: string) => {
    const trimmed = nextInput.trim();
    if (trimmed.length === 0 || isSending || trimmed.length > LIMITS.maxMessageCharacters) {
      return;
    }

    setIsSending(true);
    setError(undefined);
    pendingInvalidations.current = [];

    try {
      for await (const event of streamTutorMessage({
        input: trimmed,
        messages,
        maxSteps: LIMITS.maxAgentSteps
      })) {
        if (event.type === "done") {
          continue;
        }

        const message = event.message;
        setMessages((current) => [...current, message]);

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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="grid h-screen max-h-screen min-w-0 grid-rows-[auto_1fr_auto_auto] bg-canvas max-md:h-auto max-md:max-h-none">
      <header className="flex items-center justify-between gap-4 border-border border-b px-6 py-5">
        <div>
          <p className="mb-1 font-bold text-brand text-xs uppercase tracking-widest">Sesión efímera</p>
          <h1 className="m-0 font-bold text-3xl text-heading">Tutor académico</h1>
        </div>
        <button
          className="rounded-full border border-border-strong px-4 py-2 text-body hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={() => setMessages([])}
          disabled={messages.length === 0}
        >
          Vaciar el chat
        </button>
      </header>

      <section className="flex flex-col gap-4 overflow-y-auto p-6" aria-live="polite">
        {messages.length === 0
          ? (
              <div className="m-auto w-full max-w-3xl text-center">
                <h2 className="m-0 text-balance font-bold text-4xl text-heading leading-tight md:text-6xl">
                  Pregunta por tus materiales, apuntes, quizzes o tests.
                </h2>
                <p className="mt-4 text-muted">El historial del chat vive solo en la memoria del navegador. Al recargar, empieza de cero.</p>
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
          : messages.map((message, index) => <MessageBubble key={index} message={message} />)}
      </section>

      {error === undefined ? null : <p className="m-0 px-6 pb-3 text-danger-ink">{error}</p>}

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

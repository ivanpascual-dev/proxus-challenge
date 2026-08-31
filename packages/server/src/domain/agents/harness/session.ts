import { Effect, Queue, Stream } from "effect";
import { LanguageModel, Prompt, Tool } from "effect/unstable/ai";
import type { AgentHarness, AgentToolkit } from "./harness.ts";
import { isMaterialPageImages } from "../../materials/material.ts";
import { degradeHistory } from "./message-degrade.ts";
import { AgentMessage, type AgentMessage as AgentMessageType } from "./message.ts";

export interface AgentSessionRunOptions {
  readonly maxSteps: number;
}

export interface AgentSessionRunInput extends AgentSessionRunOptions {
  readonly input: string;
  readonly messages?: readonly AgentMessageType[];
}

// La observabilidad por paso (fase 4, decisión 7). `usage` deja sus campos sin definir cuando el
// modelo no trajo `usageMetadata`: nunca se pinta un cero que finja ser un dato (invariante 3).
export interface AgentSessionStepUsage {
  readonly inputTokens?: number | undefined;
  readonly cachedInputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
}

export interface AgentSessionStepToolCall {
  readonly name: string;
  readonly input: unknown;
}

export interface AgentSessionStepError {
  readonly message: string;
  readonly at: string;
}

export interface AgentSessionStep {
  readonly index: number;
  readonly usage: AgentSessionStepUsage;
  readonly toolCalls: readonly AgentSessionStepToolCall[];
  readonly error?: AgentSessionStepError | undefined;
}

export interface AgentSessionRunResult {
  readonly output: string;
  // Ya degradadas (palanca 1): lo único que se debe persistir o reenviar en turnos futuros.
  readonly newMessages: readonly AgentMessageType[];
  readonly messages: readonly AgentMessageType[];
  readonly steps: readonly AgentSessionStep[];
}

export interface AgentSession {
  readonly run: (
    input: AgentSessionRunInput
  ) => Effect.Effect<AgentSessionRunResult, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>>;
  readonly stream: (
    input: AgentSessionRunInput
  ) => Stream.Stream<AgentMessageType, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>>;
  // Como `run`, pero con un callback para vivir en directo los mensajes según se producen: es lo que
  // usa el endpoint NDJSON del tutor para además guardar el turno cerrado (§4.2, tramo 4C).
  readonly runTurn: (
    input: AgentSessionRunInput,
    onMessage: (message: AgentMessageType) => Effect.Effect<void>
  ) => Effect.Effect<AgentSessionRunResult, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>>;
}

export const AgentSession = {
  make: (harness: AgentHarness): AgentSession => ({
    run: (input) => run(harness, input),
    stream: (input) => stream(harness, input),
    runTurn: (input, onMessage) => execute(harness, input, onMessage)
  }),
  run,
  stream
};

function run(
  harness: AgentHarness,
  input: AgentSessionRunInput
): Effect.Effect<AgentSessionRunResult, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>> {
  return execute(harness, input, () => Effect.void);
}

function stream(
  harness: AgentHarness,
  input: AgentSessionRunInput
): Stream.Stream<AgentMessageType, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>> {
  return Stream.callback<AgentMessageType, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>>((queue) =>
    execute(harness, input, (message) => Queue.offer(queue, message).pipe(Effect.asVoid)).pipe(
      Effect.andThen(Queue.end(queue)),
      Effect.matchCauseEffect({
        onFailure: (cause) => Queue.failCause(queue, cause),
        onSuccess: () => Effect.void
      })
    )
  );
}

function execute(
  harness: AgentHarness,
  input: AgentSessionRunInput,
  emit: (message: AgentMessageType) => Effect.Effect<void>
): Effect.Effect<AgentSessionRunResult, unknown, LanguageModel.LanguageModel | Tool.HandlersFor<AgentToolkit["tools"]>> {
  return Effect.gen(function* () {
    const toolkit = yield* harness.toolkit;
    const previousMessages = input.messages ?? [];
    const newMessages: AgentMessageType[] = [];
    const steps: AgentSessionStep[] = [];
    const allMessages = () => [...previousMessages, ...newMessages] as const;
    const appendMessage = (message: AgentMessageType): Effect.Effect<void> => Effect.gen(function* () {
      newMessages.push(message);
      yield* emit(message);
    });
    const close = (output: string): AgentSessionRunResult => {
      const degradedNewMessages = degradeHistory(newMessages);
      return {
        output,
        newMessages: degradedNewMessages,
        messages: [...previousMessages, ...degradedNewMessages],
        steps
      };
    };

    yield* appendMessage(AgentMessage.user(input.input));

    let lastToolResult = "";
    const maxSteps = input.maxSteps;

    for (let step = 0; step < maxSteps; step++) {
      const prompt = renderPrompt(harness.systemPrompt, allMessages());
      const outcome = yield* LanguageModel.generateText({
        prompt,
        toolkit,
        toolChoice: "auto" as const
      }).pipe(
        Effect.matchEffect({
          onFailure: (error) => Effect.succeed({ ok: false as const, error }),
          onSuccess: (response) => Effect.succeed({ ok: true as const, response })
        })
      );

      if (!outcome.ok) {
        // Decisión 7: el fallo del modelo se registra en el paso y acaba el turno, tal cual. Ya no
        // se disfraza de mensaje del asistente que finge ser una respuesta.
        const message = formatAgentError(outcome.error);
        steps.push({
          index: step,
          usage: {},
          toolCalls: [],
          error: { message, at: new Date().toISOString() }
        });
        return close(message);
      }

      const response: LanguageModel.GenerateTextResponse<AgentToolkit["tools"]> = outcome.response;
      const usage = response.usage;
      steps.push({
        index: step,
        usage: {
          inputTokens: usage.inputTokens.total,
          cachedInputTokens: usage.inputTokens.cacheRead,
          outputTokens: usage.outputTokens.total
        },
        toolCalls: response.toolCalls.map((toolCall) => ({ name: toolCall.name, input: toolCall.params }))
      });

      for (const toolCall of response.toolCalls) {
        yield* appendMessage(AgentMessage.toolCall(toolCall.name, toolCall.params));
      }

      for (const toolResult of response.toolResults) {
        yield* appendMessage(AgentMessage.toolResult(toolResult.name, toolResult.result, toolResult.isFailure));
      }

      if (response.toolResults.length === 0) {
        const output = response.text.length > 0 ? response.text : lastToolResult;
        yield* appendMessage(AgentMessage.assistant(output));
        return close(output);
      }

      lastToolResult = String(response.toolResults.at(-1)?.result ?? lastToolResult);
    }

    const output = lastToolResult.length > 0
      ? lastToolResult
      : "Agent stopped after reaching the maximum number of steps.";
    yield* appendMessage(AgentMessage.assistant(output));

    return close(output);
  });
}

const formatAgentError = (error: unknown) => {
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return String(error);
};

const renderPrompt = (
  systemPrompt: string,
  messages: readonly AgentMessageType[]
): readonly Prompt.MessageEncoded[] => [
  {
    role: "system",
    content: systemPrompt
  },
  ...messages.map(renderMessage)
];

const renderMessage = (message: AgentMessageType): Prompt.MessageEncoded => {
  switch (message.role) {
    case "user":
      return {
        role: "user",
        content: message.content
      };
    case "assistant":
      return {
        role: "assistant",
        content: message.content
      };
    case "tool-call":
      return {
        role: "assistant",
        content: `Tool call ${message.name}: ${JSON.stringify(message.input)}`
      };
    case "tool-result":
      if (!message.isFailure && isMaterialPageImages(message.result)) {
        const result = message.result;

        // Palanca 1: un resultado degradado (turno cerrado, sin `data`) se describe en texto, nunca
        // se intenta adjuntar de nuevo. Sin esta rama se le mandaría a Gemini un `file` con
        // `data: undefined`, porque el tipo del guarda no distingue el caso degradado.
        if ("omitted" in result && result.omitted === true) {
          return {
            role: "user",
            content: `Tool result ${message.name}: pages ${result.pages.map((page) => page.page).join(", ")} from ${result.material.title} were shown earlier and are no longer attached (their image expired at the end of that turn). Call materials view again if you need to look at them.`
          };
        }

        const noticeText = result.notice === undefined ? "" : ` ${result.notice}`;
        return {
          role: "user",
          content: [
            {
              type: "text",
              text: `Tool result ${message.name}: rendered pages ${result.pages.map((page) => page.page).join(", ")} from ${result.material.title}.${noticeText}`
            },
            ...result.pages.map((page) => ({
              type: "file" as const,
              mediaType: page.mediaType,
              data: page.data,
              fileName: `${result.material.id}-page-${page.page}.png`
            }))
          ]
        };
      }

      return {
        role: "user",
        content: `Tool result ${message.name}${message.isFailure ? " failure" : ""}: ${formatToolResult(message.result)}`
      };
  }
};

const formatToolResult = (result: unknown) => {
  if (typeof result === "string") {
    return result;
  }

  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
};

import { LIMITS } from "@proxus/shared";
import { Config, Data, Effect, Layer, Redacted, Schema, Stream } from "effect";
import {
  AiError,
  LanguageModel,
  Model as AiModel,
  Response
} from "effect/unstable/ai";

const defaultModel = "gemini-3.1-flash-lite";

const FunctionCall = Schema.Struct({
  name: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Record(Schema.String, Schema.Unknown))
});

const GeminiPart = Schema.Struct({
  text: Schema.optional(Schema.String),
  functionCall: Schema.optional(FunctionCall)
});

const GeminiResponse = Schema.Struct({
  candidates: Schema.optional(Schema.Array(Schema.Struct({
    content: Schema.optional(Schema.Struct({
      parts: Schema.optional(Schema.Array(GeminiPart))
    }))
  })))
});

type GeminiPart = typeof GeminiPart.Type;

class GeminiConfigError extends Data.TaggedError("GeminiConfigError")<{
  readonly reason: string;
}> {}

const GeminiConfig = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("GOOGLE_GENERATIVE_AI_API_KEY");
  const model = yield* Config.string("GEMINI_MODEL").pipe(
    Config.orElse(() => Config.succeed(defaultModel))
  );

  const apiKeyValue = Redacted.value(apiKey).trim();

  if (apiKeyValue.length === 0) {
    return yield* new GeminiConfigError({ reason: "Missing GOOGLE_GENERATIVE_AI_API_KEY" });
  }

  return {
    apiKey: apiKeyValue,
    model: model.trim().length === 0 ? defaultModel : model.trim()
  };
});

const toAiError = (description: string) =>
  AiError.make({
    module: "GeminiLanguageModel",
    method: "generateText",
    reason: new AiError.UnknownError({ description })
  });

type GeminiContentPart =
  | { readonly text: string }
  | { readonly inlineData: { readonly mimeType: string; readonly data: string } };

interface GeminiTextContent {
  readonly role: "user" | "model";
  readonly parts: readonly GeminiContentPart[];
}

const messageText = (message: LanguageModel.ProviderOptions["prompt"]["content"][number]) =>
  messageParts(message).flatMap((part) => "text" in part ? [part.text] : []).join("\n");

const messageParts = (message: LanguageModel.ProviderOptions["prompt"]["content"][number]): readonly GeminiContentPart[] => {
  if (typeof message.content === "string") {
    return [{ text: message.content }];
  }

  return message.content.flatMap((part): readonly GeminiContentPart[] => {
    if (part.type === "text") {
      return [{ text: part.text }];
    }

    if (part.type === "file") {
      const data = fileDataToBase64(part.data);
      return data === undefined
        ? []
        : [{ inlineData: { mimeType: part.mediaType, data } }];
    }

    return [];
  });
};

const fileDataToBase64 = (data: string | Uint8Array | URL) => {
  if (typeof data !== "string") {
    return undefined;
  }

  const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(data);
  return dataUrlMatch?.[1] ?? data;
};

const promptSystemInstruction = (prompt: LanguageModel.ProviderOptions["prompt"]) => {
  const text = prompt.content
    .filter((message) => message.role === "system")
    .map(messageText)
    .join("\n");

  return text.length === 0
    ? undefined
    : { parts: [{ text }] };
};

const promptContents = (prompt: LanguageModel.ProviderOptions["prompt"]): readonly GeminiTextContent[] =>
  prompt.content
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: messageParts(message)
    }));

const geminiUrl = (model: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

const toolParameters = (toolName: string) => {
  switch (toolName) {
    case "load_skill":
      return {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name to load" }
        },
        required: ["name"]
      };
    case "use_tool":
    case "run_command":
    case "cli":
      return {
        type: "object",
        properties: {
          input: { type: "string", description: "Command input string described by a loaded skill" }
        },
        required: ["input"]
      };
    default:
      return {
        type: "object",
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" }
        },
        required: ["a", "b"]
      };
  }
};

const toolDeclarations = (tools: LanguageModel.ProviderOptions["tools"]) =>
  tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toolParameters(tool.name)
  }));

const geminiTools = (tools: LanguageModel.ProviderOptions["tools"]) =>
  tools.length === 0 ? [] : [{ functionDeclarations: toolDeclarations(tools) }];

const toolChoiceConfig = (options: LanguageModel.ProviderOptions) => {
  if (options.toolChoice === "none" || options.tools.length === 0) {
    return undefined;
  }

  if (options.toolChoice === "required") {
    return {
      mode: "ANY",
      allowedFunctionNames: options.tools.map((tool) => tool.name)
    };
  }

  if (typeof options.toolChoice === "object" && "tool" in options.toolChoice) {
    return {
      mode: "ANY",
      allowedFunctionNames: [options.toolChoice.tool]
    };
  }

  if (typeof options.toolChoice === "object" && "oneOf" in options.toolChoice) {
    return options.toolChoice.mode === "required"
      ? {
          mode: "ANY",
          allowedFunctionNames: options.toolChoice.oneOf
        }
      : { mode: "AUTO" };
  }

  return { mode: "AUTO" };
};

const toolConfig = (options: LanguageModel.ProviderOptions) => {
  const functionCallingConfig = toolChoiceConfig(options);

  return functionCallingConfig === undefined
    ? undefined
    : { functionCallingConfig };
};

// La configuración de generación que cada capa fija. La capa viva del tutor usa la temperatura baja
// de siempre y no fuerza formato; la capa JSON (§6.7.1) la usan solo la generación de preguntas y el
// juez, con `responseMimeType` y temperatura 0 para que la misma respuesta se corrija igual dos
// veces. No es composición exótica: es el mismo adaptador con otra configuración.
export interface GeminiGenerationConfig {
  readonly temperature: number;
  readonly responseMimeType?: string;
}

const DEFAULT_GENERATION: GeminiGenerationConfig = { temperature: LIMITS.modelTemperature };
const JSON_GENERATION: GeminiGenerationConfig = { temperature: LIMITS.jsonModelTemperature, responseMimeType: "application/json" };

const requestBody = (options: LanguageModel.ProviderOptions, generation: GeminiGenerationConfig) => ({
  systemInstruction: promptSystemInstruction(options.prompt),
  contents: promptContents(options.prompt),
  tools: geminiTools(options.tools),
  toolConfig: toolConfig(options),
  generationConfig: {
    temperature: generation.temperature,
    maxOutputTokens: LIMITS.maxModelOutputTokens,
    ...(generation.responseMimeType === undefined ? {} : { responseMimeType: generation.responseMimeType })
  }
});

const firstFunctionCall = (parts: ReadonlyArray<GeminiPart>) =>
  parts.find((part) => part.functionCall?.name !== undefined)?.functionCall;

const decodeGeminiResponse = (json: unknown) =>
  Schema.decodeUnknownSync(GeminiResponse)(json);

const toResponseParts = (
  parts: ReadonlyArray<GeminiPart>,
  tools: LanguageModel.ProviderOptions["tools"]
) => {
  const functionCall = firstFunctionCall(parts);

  if (functionCall?.name === undefined) {
    return parts.flatMap((part) => part.text === undefined ? [] : [Response.makePart("text", { text: part.text })]);
  }

  const toolNames = new Set(tools.map((tool) => tool.name));

  const toolCall = toolNames.has(functionCall.name)
    ? {
        name: functionCall.name,
        params: functionCall.args ?? {}
      }
    : toolNames.has("load_skill")
      ? {
          name: "load_skill",
          params: { name: functionCall.name }
        }
      : {
          name: functionCall.name,
          params: functionCall.args ?? {}
        };

  if (!toolNames.has(toolCall.name)) {
    const availableTools = tools.map((tool) => tool.name).join(", ");
    throw new Error(`Invalid tool call "${functionCall.name}". Available tools: ${availableTools}.`);
  }

  return [
    Response.makePart("tool-call", {
      id: `call_${crypto.randomUUID()}`,
      name: toolCall.name,
      params: toolCall.params,
      providerExecuted: false
    })
  ];
};

const makeGeminiLanguageModel = (generation: GeminiGenerationConfig) => Layer.effect(
  LanguageModel.LanguageModel,
  Effect.gen(function* () {
    const config = yield* GeminiConfig;

    return yield* LanguageModel.make({
      generateText: (options) =>
        Effect.tryPromise({
          try: async (signal) => {
            // Techo de tiempo del ADR-007: LIMITS.modelCallTimeoutMs. Sin esto una conexión colgada
            // retiene un permiso de concurrencia para siempre. Se combina con el signal de Effect
            // para que una interrupción del turno también aborte la llamada.
            const response = await fetch(geminiUrl(config.model, config.apiKey), {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(requestBody(options, generation)),
              signal: AbortSignal.any([signal, AbortSignal.timeout(LIMITS.modelCallTimeoutMs)])
            });

            if (!response.ok) {
              throw new Error(await response.text());
            }

            const json = decodeGeminiResponse(await response.json());
            return toResponseParts(json.candidates?.[0]?.content?.parts ?? [], options.tools);
          },
          catch: (cause) =>
            cause instanceof Error && cause.name === "TimeoutError"
              ? toAiError(`la llamada al modelo superó los ${LIMITS.modelCallTimeoutMs} ms`)
              : toAiError(cause instanceof Error ? cause.message : String(cause))
        }),
      streamText: () => Stream.empty
    });
  })
).pipe(Layer.orDie);

export const GeminiLanguageModelLive = makeGeminiLanguageModel(DEFAULT_GENERATION);

// El mismo adaptador con `responseMimeType: "application/json"` y temperatura 0 (§6.7.1). Se provee
// con `Effect.provide` en el punto de llamada de la generación de preguntas y del juez; el arnés del
// tutor sigue con `GeminiLanguageModelLive`, porque ahí hay llamadas a herramientas y forzar JSON las
// rompería. `responseSchema` se deja para después de medir: con el mime type ya se acaban las vallas
// de markdown y el texto alrededor, que es la mayoría del problema. El parseo defensivo se queda: el
// modo JSON forzado reduce los fallos, no los elimina.
export const GeminiJsonLanguageModelLive = makeGeminiLanguageModel(JSON_GENERATION);

export const GeminiModel = AiModel.make(
  "google",
  defaultModel,
  GeminiLanguageModelLive
);

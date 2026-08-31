import type { TutorChatRequest } from "@proxus/shared";
import { Effect } from "effect";
import { ApiClient } from "../../api-client/client.ts";
import { apiRuntime } from "../../lib/runtime.ts";

export const sendTutorMessageAction = apiRuntime.fn(
  (input: TutorChatRequest) =>
    ApiClient.use((client) =>
      client.tutor.chat({ payload: input })
    ).pipe(Effect.withSpan("tutor.chat", { kind: "client" })),
  { concurrent: false }
);

// La sesión vive en el servidor (fase 4, decisión 6): antes de mandar el primer mensaje hace falta
// una conversación. Minimal para el tramo 4C: crea una conversación nueva; la lista lateral para
// volver a una existente es del tramo 4E.
export const createConversationAction = apiRuntime.fn(
  () =>
    ApiClient.use((client) =>
      client.tutor.createConversation()
    ).pipe(Effect.withSpan("tutor.createConversation", { kind: "client" })),
  { concurrent: false }
);

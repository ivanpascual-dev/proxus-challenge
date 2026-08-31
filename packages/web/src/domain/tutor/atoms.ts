import type { TutorChatRequest } from "@proxus/shared";
import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
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
// una conversación. Invalida la lista lateral (`ConversationList`, tramo 4E) para que la nueva
// conversación aparezca sin refrescar a mano.
export const createConversationAction = apiRuntime.fn(
  () =>
    ApiClient.use((client) =>
      client.tutor.createConversation()
    ).pipe(Effect.withSpan("tutor.createConversation", { kind: "client" })),
  { concurrent: false, reactivityKeys: ["conversations"] }
);

// La lista lateral (decisión 6): solo resúmenes, sin mensajes ni turnos, así que no arrastra el
// historial entero de cada conversación.
export const conversationsQuery = apiRuntime
  .atom(
    ApiClient.use((client) =>
      client.tutor.listConversations()
    ).pipe(Effect.withSpan("tutor.listConversations", { kind: "client" }))
  )
  .pipe(Atom.keepAlive, Atom.withReactivity(["conversations"]));

export const conversationQuery = Atom.family((conversationId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.tutor.getConversation({ params: { id: conversationId } })
      ).pipe(Effect.withSpan("tutor.getConversation", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ conversations: [conversationId] }))
);

export const deleteConversationAction = apiRuntime.fn(
  (conversationId: string) =>
    ApiClient.use((client) =>
      client.tutor.deleteConversation({ params: { id: conversationId } })
    ).pipe(Effect.withSpan("tutor.deleteConversation", { kind: "client" })),
  { reactivityKeys: ["conversations"] }
);

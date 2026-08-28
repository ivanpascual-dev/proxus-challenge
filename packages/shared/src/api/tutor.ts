import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { AgentMessage } from "../schemas/agent-message.ts";
import { LimitExceeded, RateLimited } from "../errors/limit-exceeded.ts";

export const TutorChatRequest = Schema.Struct({
  messages: Schema.Array(AgentMessage),
  input: Schema.String,
  maxSteps: Schema.optional(Schema.Number)
});
export type TutorChatRequest = typeof TutorChatRequest.Type;

export const TutorChatResponse = Schema.Struct({
  output: Schema.String,
  newMessages: Schema.Array(AgentMessage),
  messages: Schema.Array(AgentMessage)
});
export type TutorChatResponse = typeof TutorChatResponse.Type;

export const TutorChatStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("message"),
    message: AgentMessage
  }),
  Schema.Struct({
    type: Schema.Literal("done")
  })
]);
export type TutorChatStreamEvent = typeof TutorChatStreamEvent.Type;

export class TutorApi extends HttpApiGroup.make("tutor")
  .add(HttpApiEndpoint.post("chat", "/chat", {
    payload: TutorChatRequest,
    success: TutorChatResponse,
    error: [
      LimitExceeded.pipe(HttpApiSchema.status(400)),
      RateLimited.pipe(HttpApiSchema.status(429))
    ]
  }))
  .prefix("/tutor")
{}

import { Option } from "effect";
import { LIMITS, LimitExceeded, type AgentMessage } from "@proxus/shared";

export interface ChatRequestLimitsInput {
  readonly input: string;
  readonly messages: readonly AgentMessage[];
  readonly maxSteps?: number | undefined;
}

export const checkChatRequestLimits = (request: ChatRequestLimitsInput): Option.Option<LimitExceeded> => {
  if (request.maxSteps !== undefined && request.maxSteps > LIMITS.maxAgentSteps) {
    return Option.some(new LimitExceeded({
      limit: "maxAgentSteps",
      ceiling: LIMITS.maxAgentSteps,
      received: request.maxSteps,
      message: `El máximo de pasos por turno es ${LIMITS.maxAgentSteps}, se pidieron ${request.maxSteps}.`
    }));
  }

  if (request.input.length > LIMITS.maxMessageCharacters) {
    return Option.some(new LimitExceeded({
      limit: "maxMessageCharacters",
      ceiling: LIMITS.maxMessageCharacters,
      received: request.input.length,
      message: `El mensaje supera el máximo de ${LIMITS.maxMessageCharacters} caracteres (tiene ${request.input.length}).`
    }));
  }

  if (request.messages.length > LIMITS.maxHistoryMessages) {
    return Option.some(new LimitExceeded({
      limit: "maxHistoryMessages",
      ceiling: LIMITS.maxHistoryMessages,
      received: request.messages.length,
      message: `El historial supera el máximo de ${LIMITS.maxHistoryMessages} mensajes (tiene ${request.messages.length}).`
    }));
  }

  const historyCharacters = request.messages.reduce((sum, message) => sum + messageCharacters(message), 0);
  if (historyCharacters > LIMITS.maxHistoryCharacters) {
    return Option.some(new LimitExceeded({
      limit: "maxHistoryCharacters",
      ceiling: LIMITS.maxHistoryCharacters,
      received: historyCharacters,
      message: `El historial supera el máximo de ${LIMITS.maxHistoryCharacters} caracteres (tiene ${historyCharacters}).`
    }));
  }

  return Option.none();
};

const messageCharacters = (message: AgentMessage): number => {
  switch (message.role) {
    case "user":
    case "assistant":
      return message.content.length;
    case "tool-call":
      return JSON.stringify(message.input).length;
    case "tool-result":
      return JSON.stringify(message.result).length;
  }
};

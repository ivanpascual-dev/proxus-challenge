import { Option } from "effect";
import type { ChatContextRef } from "@proxus/shared";
import { extractFollowUp } from "./follow-up.ts";
import type { AgentMessage } from "./message.ts";
import type { StoredStep, StoredTurn } from "./session-repository.ts";

// Fase 5, §5.1: separa el turno visible del prompt interno. Un fichero de sesión escrito antes de
// este campo no tiene `input`, `context`, `messageCount` ni `followUpQuestions` en disco: se migran
// aquí, al leer, de forma determinista y sin tocar `messages` (eso seguiría siendo lo que el modelo ya
// vio). Un turno ya escrito con el contrato nuevo se conserva tal cual.
export interface RawStoredTurn {
  readonly startedAt: string;
  readonly steps: readonly StoredStep[];
  readonly input?: string | undefined;
  readonly context?: readonly ChatContextRef[] | undefined;
  readonly messageCount?: number | undefined;
  readonly followUpQuestions?: readonly string[] | undefined;
}

// El texto exacto que escribe `renderScreenContext` (fase 4, decisión 11): `${input}\n\n${bloque}`.
// Solo se reconoce este sufijo literal, nunca un parecido: si no está completo, el texto se conserva
// tal cual en vez de cortar algo que el alumno escribió de verdad.
const SCREEN_CONTEXT_PREFIX = "\n\n<<<BEGIN SCREEN CONTEXT>>>\n";
const SCREEN_CONTEXT_SUFFIX = "\n<<<END SCREEN CONTEXT>>>";

export const stripScreenContext = (content: string): string => {
  const start = content.indexOf(SCREEN_CONTEXT_PREFIX);
  if (start === -1 || !content.endsWith(SCREEN_CONTEXT_SUFFIX)) {
    return content;
  }
  return content.slice(0, start);
};

// Cada turno empieza con exactamente un mensaje `user` (harness/session.ts: `execute()` lo añade sin
// condición, una vez por turno). Esa es la única marca de frontera que existe entre turnos en la
// secuencia plana de `messages`, así que sirve tanto para derivar `messageCount` en un turno antiguo
// como para comprobar la integridad de uno ya migrado.
const deriveMessageCounts = (
  messages: readonly AgentMessage[],
  turnCount: number
): Option.Option<readonly number[]> => {
  const starts: number[] = [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      starts.push(index);
    }
  });

  if (starts.length !== turnCount) {
    return Option.none();
  }

  return Option.some(starts.map((start, index) => (starts[index + 1] ?? messages.length) - start));
};

// Migra los turnos de una sesión leída de disco a su forma completa. Devuelve `None` cuando la
// frontera de turnos no se puede reconstruir con certeza (invariante 3: no se adivina el corte, se
// declara el fallo y quien llama nombra la conversación).
export const migrateStoredTurns = (
  messages: readonly AgentMessage[],
  turns: readonly RawStoredTurn[]
): Option.Option<readonly StoredTurn[]> => {
  const derivedCounts = deriveMessageCounts(messages, turns.length);
  if (Option.isNone(derivedCounts)) {
    return Option.none();
  }

  let cursor = 0;
  const migrated: StoredTurn[] = [];

  for (const [index, turn] of turns.entries()) {
    const derivedCount = derivedCounts.value[index]!;
    const messageCount = turn.messageCount ?? derivedCount;

    // Un turno que ya trae `messageCount` explícito se acepta solo si coincide con la frontera real
    // de mensajes `user`: si no coincide, la sesión está corrupta y no se adivina el reparto.
    if (messageCount !== derivedCount) {
      return Option.none();
    }

    const slice = messages.slice(cursor, cursor + messageCount);
    const first = slice[0];
    const last = slice.at(-1);

    const input = turn.input ?? (first !== undefined && first.role === "user" ? stripScreenContext(first.content) : "");
    const followUpQuestions = turn.followUpQuestions
      ?? (last !== undefined && last.role === "assistant" ? extractFollowUp(last.content).questions : []);

    migrated.push({
      startedAt: turn.startedAt,
      steps: turn.steps,
      input,
      context: turn.context ?? [],
      messageCount,
      followUpQuestions
    });

    cursor += messageCount;
  }

  return Option.some(migrated);
};

// La copia de presentación de `messages` que ve el cliente (decisión 38: "la respuesta del API y el
// render visible usan `ConversationTurn.input`"). No toca `StoredAgentSession.messages`: esa sigue
// siendo, sin tocar, lo que `runTurn` reenvía al modelo como historial. Dos casos:
// - el mensaje `user` que abre cada turno se sustituye por `turn.input`, nunca por el bloque técnico;
// - si el último mensaje `assistant` del turno todavía arrastra un `<<<FOLLOW-UP>>>` sin recortar (una
//   sesión anterior al recorte en el propio `session.ts`), se limpia para presentación.
export const toPresentationMessages = (
  messages: readonly AgentMessage[],
  turns: readonly StoredTurn[]
): readonly AgentMessage[] => {
  const result = [...messages];
  let cursor = 0;

  for (const turn of turns) {
    const start = cursor;
    const end = cursor + turn.messageCount;

    const first = result[start];
    if (first !== undefined && first.role === "user" && first.content !== turn.input) {
      result[start] = { role: "user", content: turn.input };
    }

    const lastIndex = end - 1;
    const last = result[lastIndex];
    if (last !== undefined && last.role === "assistant") {
      const cleaned = extractFollowUp(last.content).text;
      if (cleaned !== last.content) {
        result[lastIndex] = { role: "assistant", content: cleaned };
      }
    }

    cursor = end;
  }

  return result;
};

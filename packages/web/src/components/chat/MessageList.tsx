import { ChatMessage } from "./ChatMessage.tsx";
import { FollowUpQuestions } from "../FollowUpQuestions.tsx";
import type { TurnView } from "../../domain/tutor/turn-view.ts";

// Fase 5, §4.4: solo las preguntas de seguimiento del último turno ya terminado se muestran como
// acciones (decisión §5.1). Un turno en curso no cuenta todavía como terminado, así que mientras
// `liveTurn` esté presente no hay follow-ups que ofrecer.
interface MessageListProps {
  readonly turns: readonly TurnView[];
  readonly liveTurn: TurnView | null;
  readonly onSelectFollowUp: (question: string) => void;
  readonly sending: boolean;
}

export function MessageList({ turns, liveTurn, onSelectFollowUp, sending }: MessageListProps) {
  const lastTerminatedTurn = liveTurn === null ? turns.at(-1) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {turns.map((turn) => <ChatMessage key={turn.key} turn={turn} />)}
      {liveTurn !== null && <ChatMessage turn={liveTurn} />}

      {lastTerminatedTurn !== undefined && lastTerminatedTurn.followUpQuestions.length > 0 && (
        <FollowUpQuestions
          questions={lastTerminatedTurn.followUpQuestions}
          onSelect={onSelectFollowUp}
          disabled={sending}
        />
      )}
    </div>
  );
}

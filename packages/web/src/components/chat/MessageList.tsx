import { ChatMessage } from "./ChatMessage.tsx";
import { FollowUpQuestions } from "../FollowUpQuestions.tsx";
import type { TurnView } from "../../domain/tutor/turn-view.ts";

// Fase 5, §4.4: solo las preguntas de seguimiento del último turno ya terminado se muestran como
// acciones (decisión §5.1). Un turno en curso no cuenta todavía como terminado, así que mientras
// `liveTurn` esté presente no hay follow-ups que ofrecer.
//
// Plan de correcciones §4.2.6 / C5-10: el turno vivo y el resto se renderizan en la misma lista y con
// la misma `key` (`live-…` para los de esta sesión), así el componente se reconcilia en su sitio
// cuando el turno pasa de "en vivo" a cerrado y el revelado no se reinicia. `reveal` solo va al último
// turno de esta sesión; los hidratados del historial (`turn-…`) se muestran completos.
interface MessageListProps {
  readonly turns: readonly TurnView[];
  readonly liveTurn: TurnView | null;
  readonly onSelectFollowUp: (question: string) => void;
  readonly sending: boolean;
  readonly onOpenCitation: (materialId: string, page: number) => void;
}

export function MessageList({ turns, liveTurn, onSelectFollowUp, sending, onOpenCitation }: MessageListProps) {
  const allTurns = liveTurn === null ? turns : [...turns, liveTurn];
  const newest = allTurns.at(-1);
  const revealKey = newest !== undefined && newest.key.startsWith("live-") ? newest.key : undefined;

  const lastTerminatedTurn = liveTurn === null ? turns.at(-1) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {allTurns.map((turn) => (
        <ChatMessage key={turn.key} turn={turn} reveal={turn.key === revealKey} onOpenCitation={onOpenCitation} />
      ))}

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

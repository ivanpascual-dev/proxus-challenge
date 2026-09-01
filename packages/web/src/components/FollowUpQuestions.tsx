// Decisión 8 (fase 4): las tres preguntas de seguimiento, o ninguna. El servidor ya garantiza que
// nunca llegan a medias ni infladas (`extractFollowUp`): si el array está vacío, no se pinta nada.
import { ActionButton } from "./ui/ActionButton.tsx";

export function FollowUpQuestions({
  questions,
  onSelect,
  disabled
}: {
  readonly questions: readonly string[];
  readonly onSelect: (question: string) => void;
  readonly disabled: boolean;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" aria-label="Preguntas de seguimiento">
      {questions.map((question) => (
        <ActionButton
          key={question}
          icon="arrow-right"
          variant="neutral"
          className="w-fit max-w-full shrink whitespace-normal text-left [&>span]:min-w-0"
          onClick={() => onSelect(question)}
          disabled={disabled}
        >
          {question}
        </ActionButton>
      ))}
    </div>
  );
}

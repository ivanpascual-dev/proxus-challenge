// Decisión 8 (fase 4): las tres preguntas de seguimiento, o ninguna. El servidor ya garantiza que
// nunca llegan a medias ni infladas (`extractFollowUp`): si el array está vacío, no se pinta nada.
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
    <div className="flex flex-col gap-2 px-6 pb-3" aria-label="Preguntas de seguimiento">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          className="w-fit max-w-full rounded-2xl border border-border-strong bg-surface px-4 py-2 text-left text-body text-sm hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onSelect(question)}
          disabled={disabled}
        >
          {question}
        </button>
      ))}
    </div>
  );
}

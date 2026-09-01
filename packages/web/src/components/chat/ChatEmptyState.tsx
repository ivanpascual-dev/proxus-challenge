// Fase 5, §4.4: una frase corta, tres sugerencias ligadas a acciones que el producto puede cumplir y
// el composer (que vive fuera, en `Chat.tsx`). Sin hero de 60px.
const STARTER_PROMPTS = [
  "Lista mis materiales subidos",
  "Crea un quiz corto a partir de mis materiales",
  "Explícame paso a paso el concepto más difícil de mis apuntes"
] as const;

export function ChatEmptyState({ onSelect }: { readonly onSelect: (prompt: string) => void }) {
  return (
    <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <p className="text-balance font-semibold text-heading text-xl">
        Pregúntale a Sym por tus materiales, apuntes, quizzes o tests.
      </p>
      <div className="grid w-full grid-cols-3 gap-2.5 max-lg:grid-cols-1">
        {STARTER_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="rounded-[10px] border border-border-strong bg-surface p-3.5 text-left text-body text-sm hover:border-brand"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

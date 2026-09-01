// Fase 5, §4.4: una frase corta, tres sugerencias ligadas a acciones que el producto puede cumplir y
// el composer (que vive fuera, en `Chat.tsx`). Sin hero de 60px.
import { ActionButton } from "../ui/ActionButton.tsx";

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
          <ActionButton
            key={prompt}
            icon="arrow-right"
            variant="neutral"
            onClick={() => onSelect(prompt)}
            className="w-full min-w-0 shrink justify-start whitespace-normal p-3.5 text-left [&>span]:min-w-0"
          >
            {prompt}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

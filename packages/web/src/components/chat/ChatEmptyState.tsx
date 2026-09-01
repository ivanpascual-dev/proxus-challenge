// Fase 5, §4.4: una frase corta, tres sugerencias ligadas a acciones que el producto puede cumplir y
// el composer (que vive fuera, en `Chat.tsx`). Sin hero de 60px.
//
// C5-11 / plan de correcciones §6.3: el texto es canónico y se copia literal. Ninguna sugerencia
// ofrece crear Controles ni Exámenes: el tutor no tiene esa capacidad (F3-34, `docs/ai-agent.md`).
import { ActionButton } from "../ui/ActionButton.tsx";

const STARTER_PROMPTS = [
  "Crea una regla mnemotécnica para recordar las ideas clave de uno de mis materiales",
  "Explícame el tema que peor llevo según mi progreso y dime por qué",
  "Compara dos conceptos relacionados de mis apuntes con un ejemplo"
] as const;

interface ChatEmptyStateProps {
  readonly onSelect: (prompt: string) => void;
  // Solo cuando el alumno todavía no ha subido ningún material: sin material, Sym casi no tiene de
  // qué tirar.
  readonly showUploadHint?: boolean;
  // Cuando ya se ha alcanzado `maxConversations`: el aviso lo pinta `ChatFrame` sobre el chat; aquí
  // solo se desactivan las sugerencias, que crearían una conversación que va a fallar.
  readonly blocked?: boolean;
}

export function ChatEmptyState({ onSelect, showUploadHint = false, blocked = false }: ChatEmptyStateProps) {
  return (
    <div className="m-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <p className="text-balance font-semibold text-heading text-xl">
          Estudia con Sym usando tus materiales, apuntes y progreso.
        </p>
        {showUploadHint
          ? <p className="text-balance text-muted text-sm">
              Sube tus materiales para que Sym pueda ayudarte mejor con tu estudio.
            </p>
          : null}
      </div>

      <div className="grid w-full grid-cols-3 gap-2.5 max-lg:grid-cols-1">
        {STARTER_PROMPTS.map((prompt) => (
          <ActionButton
            key={prompt}
            icon="arrow-right"
            variant="neutral"
            disabled={blocked}
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

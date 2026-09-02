// Fase 5, §4.4: una frase corta, tres sugerencias ligadas a acciones que el producto puede cumplir y
// el composer (que vive fuera, en `Chat.tsx`). Sin hero de 60px.
//
// C5-11 / plan de correcciones §6.3: el texto es canónico y se copia literal. Ninguna sugerencia
// ofrece crear Controles ni Exámenes: el tutor no tiene esa capacidad (F3-34, `docs/ai-agent.md`).
//
// Correcciones posteriores a la sesión 4: cada sugerencia lleva un icono propio en vez de la flecha
// genérica, y la rejilla usa una container query (no el viewport) para apilarse cuando el panel del
// chat se estrecha, de modo que el texto largo de cada tarjeta no se desborda.
import { ActionButton } from "../ui/ActionButton.tsx";
import { SymAvatar } from "../ui/SymAvatar.tsx";
import type { IconName } from "../ui/Icon.tsx";

const STARTER_PROMPTS: ReadonlyArray<{ readonly text: string; readonly icon: IconName }> = [
  { text: "Crea una regla mnemotécnica para recordar las ideas clave de uno de mis materiales", icon: "lightbulb" },
  { text: "Explícame el tema que peor llevo según mi progreso y dime por qué", icon: "target" },
  { text: "Compara dos conceptos relacionados de mis apuntes con un ejemplo", icon: "scale" }
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
    <div className="@container m-auto flex w-full max-w-2xl flex-col items-center gap-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <SymAvatar size={44} />
        <p className="text-balance font-semibold text-heading text-xl">
          Estudia con Sym usando tus materiales, apuntes y progreso.
        </p>
        {showUploadHint
          ? <p className="text-balance text-muted text-sm">
              Sube tus materiales para que Sym pueda ayudarte mejor con tu estudio.
            </p>
          : null}
      </div>

      <div className="grid w-full grid-cols-1 gap-2.5 @lg:grid-cols-3">
        {STARTER_PROMPTS.map((prompt) => (
          <ActionButton
            key={prompt.text}
            icon={prompt.icon}
            variant="neutral"
            disabled={blocked}
            onClick={() => onSelect(prompt.text)}
            className="w-full min-w-0 shrink justify-start whitespace-normal p-3.5 text-left [&>span]:min-w-0"
          >
            {prompt.text}
          </ActionButton>
        ))}
      </div>
    </div>
  );
}

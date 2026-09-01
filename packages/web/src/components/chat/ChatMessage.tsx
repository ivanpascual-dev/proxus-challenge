import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Icon } from "../ui/Icon.tsx";
import { SymAvatar } from "../ui/SymAvatar.tsx";
import { AgentActivity } from "./AgentActivity.tsx";
import { useAssistantReveal } from "./useAssistantReveal.ts";
import type { TurnView } from "../../domain/tutor/turn-view.ts";

// Fase 5, §4.4, decisión 22: la respuesta de Sym no vive en una tarjeta, el texto se presenta sobre el
// lienzo; el mensaje del alumno conserva una superficie tenue y compacta. Un turno es la unidad de
// render: burbuja del alumno, actividad del agente si la hubo, y la respuesta final o el fallo.
//
// Plan de correcciones §4.2.6 / C5-10: `reveal` solo lo activa `MessageList` para el turno vivo (o el
// recién cerrado que sigue siendo el último). Con `reveal` la respuesta nueva se revela progresivamente
// durante como mucho 1,5s; los turnos hidratados del historial no lo llevan y se muestran completos.
export function ChatMessage({ turn, reveal = false }: { readonly turn: TurnView; readonly reveal?: boolean }) {
  const { visibleText, animating, didAnimate } = useAssistantReveal(turn.assistantText, reveal);

  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[72%] self-end whitespace-pre-wrap rounded-sm bg-brand-soft px-4 py-2.5 text-heading text-sm leading-6">
        {turn.input}
      </p>

      <AgentActivity calls={turn.calls} status={turn.status} errorMessage={turn.errorMessage} />

      {turn.assistantText !== null && (
        <div className="flex max-w-[820px] gap-3">
          {/* Avatar de Sym en una guía estrecha: identifica al emisor sin envolver la respuesta en una
              tarjeta (decisión 22, el texto sigue sobre el lienzo). */}
          <SymAvatar size={26} className="mt-0.5" />
          <div className="min-w-0 flex-1 text-[0.95rem] text-heading leading-7">
            {/* Mientras se revela, el lector de pantalla no lee cada fragmento (`aria-live="off"`). */}
            <div aria-live="off">
              <Streamdown>{visibleText}</Streamdown>
            </div>
            {didAnimate && !animating && (
              <span className="sr-only" aria-live="polite">{turn.assistantText}</span>
            )}
          </div>
        </div>
      )}

      {turn.status === "failure" && turn.assistantText === null && (
        <div className="flex max-w-[820px] gap-3">
          <SymAvatar size={26} className="mt-0.5" />
          <p className="flex min-w-0 flex-1 items-center gap-2 text-danger-ink text-sm">
            <Icon name="warning" size={16} className="shrink-0" />
            {turn.errorMessage ?? "No hemos podido completar esta acción. Tus datos anteriores siguen guardados. Vuelve a intentarlo."}
          </p>
        </div>
      )}
    </div>
  );
}

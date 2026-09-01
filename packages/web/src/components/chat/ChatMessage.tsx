import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Icon } from "../ui/Icon.tsx";
import { AgentActivity } from "./AgentActivity.tsx";
import type { TurnView } from "../../domain/tutor/turn-view.ts";

// Fase 5, §4.4, decisión 22: la respuesta de Sym no vive en una tarjeta, el texto se presenta sobre el
// lienzo; el mensaje del alumno conserva una superficie tenue y compacta. Un turno es la unidad de
// render: burbuja del alumno, actividad del agente si la hubo, y la respuesta final o el fallo.
export function ChatMessage({ turn }: { readonly turn: TurnView }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[72%] self-end whitespace-pre-wrap rounded-sm bg-brand-soft px-4 py-2.5 text-heading text-sm leading-6">
        {turn.input}
      </p>

      <AgentActivity calls={turn.calls} status={turn.status} errorMessage={turn.errorMessage} />

      {turn.assistantText !== null && (
        <div className="max-w-[820px] text-[0.95rem] text-heading leading-7">
          <Streamdown>{turn.assistantText}</Streamdown>
        </div>
      )}

      {turn.status === "failure" && turn.assistantText === null && (
        <p className="flex max-w-[820px] items-center gap-2 text-danger-ink text-sm">
          <Icon name="warning" size={16} className="shrink-0" />
          {turn.errorMessage ?? "No hemos podido completar esta acción. Tus datos anteriores siguen guardados. Vuelve a intentarlo."}
        </p>
      )}
    </div>
  );
}

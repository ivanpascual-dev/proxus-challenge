import { Icon } from "../ui/Icon.tsx";
import { describeActivityCall, turnActivityVerb } from "../../domain/tutor/activity-labels.ts";
import { formatActivityDetail } from "../../lib/activity-detail.ts";
import type { ActivityCall, TurnStatus } from "../../domain/tutor/turn-view.ts";

// Fase 5, §4.4 y §4.11: un turno agrupa su actividad antes de la respuesta final. Cerrado enseña
// verbo, contador y estado (decisión 23); abierto lista las llamadas en el orden persistido, cada una
// con su propio segundo nivel técnico (decisión 33: la única superficie que enseña input/result
// crudo, ya filtrado y abreviado por `formatActivityDetail`). Nunca pinta el `result` completo ni
// consumo de tokens.

interface AgentActivityProps {
  readonly calls: readonly ActivityCall[];
  readonly status: TurnStatus;
  readonly errorMessage: string | null;
}

export function AgentActivity({ calls, status, errorMessage }: AgentActivityProps) {
  // Un turno directo (respuesta sin herramientas, ya terminada) no tiene nada que contar: la burbuja
  // del asistente ya lo dice todo. Con actividad, en curso o fallido, sí hay algo que enseñar.
  if (calls.length === 0 && status === "success") {
    return null;
  }

  const verb = turnActivityVerb({ callCount: calls.length, failed: status === "failure" });
  const stateLabel = status === "running" ? "En curso" : status === "failure" ? "Falló" : "Hecho";
  const stateIcon = status === "failure" ? "warning" : status === "running" ? "progress" : "check-circle";
  const stateColor = status === "failure" ? "text-danger-ink" : status === "running" ? "text-muted" : "text-success-ink";

  return (
    <details className="w-fit max-w-full rounded-[10px] border border-border bg-surface-muted text-sm" open={status === "running" || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-muted hover:text-heading">
        <Icon name={stateIcon} size={16} className={stateColor} />
        <span>
          {verb}
          {calls.length > 0 && ` · ${calls.length} ${calls.length === 1 ? "paso" : "pasos"}`}
          {` · ${stateLabel}`}
        </span>
      </summary>

      <div className="flex flex-col gap-1.5 border-border border-t px-3 py-2">
        {calls.map((call, index) => <AgentActivityCall key={index} call={call} />)}
        {status === "failure" && errorMessage !== null && (
          <p className="text-danger-ink text-xs">{errorMessage}</p>
        )}
      </div>
    </details>
  );
}

function AgentActivityCall({ call }: { readonly call: ActivityCall }) {
  const label = describeActivityCall(call.name, call.input);
  const input = formatActivityDetail(call.input);
  const result = call.hasResult ? formatActivityDetail(call.result) : null;

  return (
    <details className="rounded-lg border border-border/60 bg-canvas px-2.5 py-1.5 text-xs">
      <summary className="flex cursor-pointer select-none items-center gap-2 text-body">
        <Icon
          name={!call.hasResult ? "progress" : call.isFailure ? "warning" : "check"}
          size={16}
          className={!call.hasResult ? "text-muted" : call.isFailure ? "text-danger-ink" : "text-success-ink"}
        />
        {label}
      </summary>
      <div className="mt-2 flex flex-col gap-2 text-muted">
        <p className="font-medium text-heading">Herramienta: <span className="font-normal text-muted">{call.name}</span></p>
        <ActivityDetailBlock title="Entrada" detail={input} />
        {call.hasResult
          ? <ActivityDetailBlock title={call.isFailure ? "Resultado (falló)" : "Resultado"} detail={result!} />
          : <p className="italic">No hay resultado disponible.</p>}
      </div>
    </details>
  );
}

function ActivityDetailBlock({ title, detail }: { readonly title: string; readonly detail: { readonly text: string; readonly truncated: boolean } }) {
  return (
    <div>
      <p className="font-medium text-heading">{title}</p>
      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-muted p-2 text-[0.7rem]">{detail.text}</pre>
      {detail.truncated && <p className="mt-1 text-[0.7rem] italic">Detalle abreviado.</p>}
    </div>
  );
}

import { useAtomSet } from "@effect/atom-react";
import { useState } from "react";
import { abandonAttemptAction } from "../../domain/assessments/atoms.ts";
import { messageOf } from "../../lib/error-message.ts";

// El diálogo de la decisión 19d: lo primero que se ve al arrancar la aplicación si hay un examen a
// medias. Es también la llave de la puerta cerrada (decisión 18): elijas lo que elijas, sales del
// bloqueo en un clic. Es lo único que se puede hacer desde esta pantalla.

export function ResumeExamDialog({
  artifactId,
  attemptId,
  title,
  remainingSeconds,
  onResume
}: {
  readonly artifactId: string;
  readonly attemptId: string;
  readonly title: string | null;
  readonly remainingSeconds: number | null;
  readonly onResume: () => void;
}) {
  const abandon = useAtomSet(abandonAttemptAction, { mode: "promise" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const minutes = remainingSeconds === null ? null : Math.max(0, Math.ceil(remainingSeconds / 60));

  const onCancel = async () => {
    if (busy || !window.confirm(
      "¿Cancelar el examen? El intento se guarda como cancelado, no se corrige y no se puede deshacer."
    )) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      // Al abrir la puerta, `abandonAttemptAction` invalida `attempts`: `activeAttemptQuery` se
      // refresca solo y App vuelve a la aplicación normal.
      await abandon({ artifactId, attemptId });
    } catch (cause) {
      setError(messageOf(cause));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas p-6 text-heading">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6">
        <p className="font-bold text-brand text-xs uppercase tracking-widest">Examen a medias</p>
        <h2 className="mt-2 font-bold text-heading text-xl">
          Tienes un examen a medias{title === null ? "" : `: ${title}`}
        </h2>
        <p className="mt-2 text-muted">
          {minutes === null
            ? "Puedes volver a él o cancelarlo."
            : `Te quedan unos ${minutes} ${minutes === 1 ? "minuto" : "minutos"}. ¿Volver a él o cancelarlo?`}
        </p>

        {error !== undefined && (
          <p className="mt-4 rounded-2xl border border-danger/40 bg-danger/15 p-3 text-danger-ink text-sm">{error}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onResume}
            disabled={busy}
            className="rounded-full bg-brand px-5 py-2 font-semibold text-on-brand hover:bg-brand/90 disabled:opacity-50"
          >
            Volver al examen
          </button>
          <button
            type="button"
            onClick={() => void onCancel()}
            disabled={busy}
            className="rounded-full border border-border-strong px-5 py-2 text-body text-sm hover:border-danger hover:text-danger-ink disabled:opacity-50"
          >
            {busy ? "Cancelando…" : "Cancelarlo"}
          </button>
        </div>
      </div>
    </div>
  );
}

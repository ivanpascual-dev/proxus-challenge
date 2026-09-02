import type { ProgressLine } from "../../domain/progress/progress-line.ts";

// La línea viva de una generación (fase 5, §11.3). Una sola línea que se sustituye, nunca una lista
// que crece con aspecto de consola. Sustituye a las tres presentaciones que convivían (indexado,
// apuntes y pruebas) y a la línea por fichero de la cola de subida.
//
// Accesibilidad (F5-45, riesgo 20): solo la frase vive dentro del `role="status"`; el contador va
// aparte y `aria-hidden`, para que indexar un material de 82 páginas no dispare 82 anuncios en un
// lector de pantalla. Lo que se anuncia es el cambio de fase, no cada paso.
//
// La barra no muestra porcentaje mientras el total sea desconocido: en ese caso es una banda tenue,
// no una fracción elegida a ojo. El movimiento lo apaga la regla global de `prefers-reduced-motion`.

export function GenerationProgress({
  line,
  className = ""
}: {
  readonly line: ProgressLine;
  readonly className?: string;
}) {
  const counted = line.step !== null && line.total !== null;
  const ratio = counted ? Math.min(1, Math.max(0, line.step / line.total)) : 0;

  return (
    <div className={`grid gap-1.5 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span role="status" aria-live="polite" className="text-muted">
          {line.phrase}
        </span>
        {counted && (
          <span aria-hidden="true" className="text-muted/80 text-xs tabular-nums">
            · {line.step} de {line.total}
          </span>
        )}
      </div>
      <div className="h-0.5 w-full overflow-hidden bg-border">
        {counted ? (
          <div
            className="h-full bg-brand transition-[width] duration-300"
            style={{ width: `${ratio * 100}%` }}
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-brand/40" />
        )}
      </div>
    </div>
  );
}

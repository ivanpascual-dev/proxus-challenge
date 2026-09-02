import type { ConversationSource } from "@proxus/shared";
import { MaterialCitation } from "../ui/MaterialCitation.tsx";
import { formatSourcePages } from "../../domain/tutor/sources.ts";

// Fase 5, §5.3 y decisión 26: la procedencia del chat usa la misma cita navegable que apuntes y
// pruebas, etiquetada `Fuentes consultadas`. Es lo que Sym leyó de verdad en este turno, no una
// afirmación de que cada frase de la respuesta esté demostrada por todas ellas: por eso el encabezado
// habla de consulta y cada entrada abre su material y su primera página.
//
// El título del material va en su propia línea, truncado, y el botón lleva solo las páginas: un
// nombre de fichero largo dentro del botón obligaría al chat a hacer scroll horizontal, y §4.4 lo
// reserva para tablas y código.

interface TurnSourcesProps {
  readonly sources: readonly ConversationSource[];
  readonly onOpenCitation: (materialId: string, page: number) => void;
}

export function TurnSources({ sources, onOpenCitation }: TurnSourcesProps) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 max-w-[820px] flex-col gap-1.5 pl-[38px]">
      <p className="font-medium text-[0.7rem] text-muted uppercase tracking-wide">Fuentes consultadas</p>
      <ul className="flex min-w-0 flex-col gap-1.5">
        {sources.map((source) => (
          <li key={source.materialId} className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-body text-xs" title={source.title}>{source.title}</span>
            <MaterialCitation
              materialId={source.materialId}
              pages={source.pages}
              // Basta con que una de las páginas leídas sea transcripción del modelo para avisarlo:
              // la promesa de la invariante 8 es que el alumno pueda abrir la página real y mirarla.
              transcribed={source.transcribedPages.length > 0}
              label={formatSourcePages(source.pages)}
              onOpen={onOpenCitation}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

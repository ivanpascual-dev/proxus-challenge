import { Effect, Ref } from "effect";
import type { ConversationSource } from "@proxus/shared";

// Fase 5, §5.3: la procedencia del chat. Una fuente nace de una llamada que **completó** una lectura o
// una vista de material y sirvió páginas de verdad; el material y las páginas salen del repositorio,
// nunca del texto que escribe el modelo ni de la respuesta final. Este módulo es la parte pura: fusiona
// una fuente recién confirmada con las que ya lleva el turno y dice si eso cambió algo, para no emitir
// dos veces la misma. El registro con estado (Ref) vive debajo, en `makeTurnSourceRecorder`.

const mergePages = (current: readonly number[], next: readonly number[]): readonly number[] =>
  [...new Set([...current, ...next])].sort((a, b) => a - b);

const samePages = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((page, index) => page === b[index]);

export interface MergeTurnSourceResult {
  readonly sources: readonly ConversationSource[];
  // La entrada ya fusionada, cuando esta llamada aportó algo nuevo; `null` cuando no cambió nada y no
  // hay evento que emitir.
  readonly emitted: ConversationSource | null;
}

// Deduplica por material y página (§5.3). El mismo material vuelve con sus páginas ya fusionadas, así
// que quien consume `emitted` sustituye la entrada de ese `materialId` en vez de acumular otra. El
// orden de las fuentes es el de primera aparición: es el orden real en que el agente las consultó.
export const mergeTurnSource = (
  current: readonly ConversationSource[],
  next: ConversationSource
): MergeTurnSourceResult => {
  // Una llamada que no sirvió ninguna página no es una fuente: decir que se consultó un material del
  // que no se leyó nada sería exactamente el valor neutro que prohíbe la invariante 3.
  if (next.pages.length === 0) {
    return { sources: current, emitted: null };
  }

  const index = current.findIndex((source) => source.materialId === next.materialId);
  if (index === -1) {
    const added: ConversationSource = {
      materialId: next.materialId,
      title: next.title,
      pages: mergePages([], next.pages),
      transcribedPages: mergePages([], next.transcribedPages)
    };
    return { sources: [...current, added], emitted: added };
  }

  const existing = current[index]!;
  const merged: ConversationSource = {
    materialId: existing.materialId,
    // El título es el del repositorio en ambos casos; se conserva el de la primera aparición para que
    // la lista no baile si el material se renombra a mitad de turno.
    title: existing.title,
    pages: mergePages(existing.pages, next.pages),
    transcribedPages: mergePages(existing.transcribedPages, next.transcribedPages)
  };

  if (samePages(existing.pages, merged.pages) && samePages(existing.transcribedPages, merged.transcribedPages)) {
    return { sources: current, emitted: null };
  }

  const sources = [...current];
  sources[index] = merged;
  return { sources, emitted: merged };
};

// El registro por turno. Se construye una vez por petición, igual que el presupuesto de turno: dos
// peticiones no comparten qué materiales se han consultado. `onSource` es lo que hace que la fuente se
// vea durante el streaming; en el camino sin stream es un no-op.
export interface TurnSourceRecorder {
  readonly record: (source: ConversationSource) => Effect.Effect<void>;
  readonly collected: Effect.Effect<readonly ConversationSource[]>;
}

export const makeTurnSourceRecorder = (
  onSource: (source: ConversationSource) => Effect.Effect<void>
): Effect.Effect<TurnSourceRecorder> => Effect.gen(function* () {
  const ref = yield* Ref.make<readonly ConversationSource[]>([]);

  return {
    // Leer y escribir por separado basta aquí, igual que en `renderWithBudget`: el bucle del agente
    // ejecuta un comando cada vez dentro del turno, y este registro no se comparte entre peticiones.
    record: (source) => Effect.gen(function* () {
      const current = yield* Ref.get(ref);
      const merged = mergeTurnSource(current, source);
      yield* Ref.set(ref, merged.sources);

      if (merged.emitted !== null) {
        yield* onSource(merged.emitted);
      }
    }),
    collected: Ref.get(ref)
  };
});

// El registro vacío que usa el CLI de demostración: el agente por línea de comandos no tiene turno que
// guardar ni stream que alimentar.
export const noopTurnSourceRecorder = makeTurnSourceRecorder(() => Effect.void);

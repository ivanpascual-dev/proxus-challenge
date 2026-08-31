import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ApiClient } from "../../api-client/client.ts";
import { apiRuntime } from "../../lib/runtime.ts";

// El perfil de estudio de un material, tema a tema, con las señales por separado (ADR-002, ADR-003).
// Solo lectura. Se invalida cuando cambia un intento (`attempts`): entregar o discrepar recalcula el
// perfil en el servidor.
export const studyProfileQuery = Atom.family((materialId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.materials.profile({ params: { id: materialId } })
      ).pipe(Effect.withSpan("materials.profile", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity(["attempts"]))
);

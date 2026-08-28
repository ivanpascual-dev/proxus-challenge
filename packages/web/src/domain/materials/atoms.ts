import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ApiClient } from "../../api-client/client.ts";
import { apiRuntime } from "../../lib/runtime.ts";

export const materialsQuery = apiRuntime
  .atom(
    ApiClient.use((client) =>
      client.materials.list()
    ).pipe(Effect.withSpan("materials.list", { kind: "client" }))
  )
  .pipe(Atom.keepAlive, Atom.withReactivity(["materials"]));

// El índice de un material (sin imágenes): temas, procedencia y texto por página.
export const materialIndexQuery = Atom.family((materialId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.materials.index({ params: { id: materialId } })
      ).pipe(Effect.withSpan("materials.index", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ materials: [materialId] }))
);

// La imagen real de una página más su entrada de índice, en la misma petición (invariante 8).
export const materialPageQuery = Atom.family((key: string) => {
  const separator = key.lastIndexOf(":");
  const materialId = key.slice(0, separator);
  const page = Number(key.slice(separator + 1));
  return apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.materials.page({ params: { id: materialId, page } })
      ).pipe(Effect.withSpan("materials.page", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ materials: [materialId] }));
});

export const materialPageKey = (materialId: string, page: number) => `${materialId}:${page}`;

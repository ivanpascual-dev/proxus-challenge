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

// El índice de un material (sin imágenes): temas con su jerarquía, procedencia y texto por página.
export const materialIndexQuery = Atom.family((materialId: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.materials.index({ params: { id: materialId } })
      ).pipe(Effect.withSpan("materials.index", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ materials: [materialId] }))
);

// El render real de una página del PDF. No exige índice: se puede ver el PDF antes de indexarlo.
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

// Sube un lote de PDFs (decisión 2: solo PDF). El payload es un FormData de verdad: el cliente
// generado solo sabe codificar multipart cuando `request.payload instanceof FormData`
// (`HttpApiClient.js`), así que aquí no hay schema que codifique nada.
export const uploadMaterialsAction = apiRuntime.fn(
  (files: readonly File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file, file.name);
    }
    return ApiClient.use((client) =>
      client.materials.upload({ payload: formData })
    ).pipe(Effect.withSpan("materials.upload", { kind: "client" }));
  },
  { reactivityKeys: ["materials"] }
);

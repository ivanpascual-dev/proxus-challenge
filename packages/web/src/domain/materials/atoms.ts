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

// Comprueba un lote de PDFs (tipo, nombre duplicado) sin subir nada: la zona de arrastre lo llama
// sola al soltar los ficheros, antes de ofrecer el botón "Subir". Sin `reactivityKeys`: no crea ni
// cambia ningún material, así que no hay nada que invalidar.
export const validateMaterialsAction = apiRuntime.fn(
  (files: readonly File[]) => {
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file, file.name);
    }
    return ApiClient.use((client) =>
      client.materials.validate({ payload: formData })
    ).pipe(Effect.withSpan("materials.validate", { kind: "client" }));
  }
);

// Borra el PDF y, en cascada, su apunte, controles y exámenes (ADR-011: el materialId sale del
// nombre del fichero, así que un huérfano choca al resubir el mismo PDF). Invalida ambas etiquetas:
// la lista de materiales y la de artefactos.
export const deleteMaterialAction = apiRuntime.fn(
  (materialId: string) =>
    ApiClient.use((client) =>
      client.materials.remove({ params: { id: materialId } })
    ).pipe(Effect.withSpan("materials.remove", { kind: "client" })),
  { reactivityKeys: ["materials", "artifacts"] }
);

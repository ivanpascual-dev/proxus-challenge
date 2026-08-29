import type { ArtifactKind, RewriteMode, SaveNoteInput, SubmitAttemptInput } from "@proxus/shared";
import { Effect } from "effect";
import * as Atom from "effect/unstable/reactivity/Atom";
import { ApiClient } from "../../api-client/client.ts";
import { apiRuntime } from "../../lib/runtime.ts";

export const artifactsQuery = apiRuntime
  .atom(
    ApiClient.use((client) =>
      client.artifacts.list({ query: {} })
    ).pipe(Effect.withSpan("artifacts.list", { kind: "client" }))
  )
  .pipe(Atom.keepAlive, Atom.withReactivity(["artifacts"]));

export const artifactsByKindQuery = Atom.family((kind: ArtifactKind) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.artifacts.list({ query: { kind } })
      ).pipe(Effect.withSpan("artifacts.listByKind", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ artifacts: [kind] }))
);

export const artifactQuery = Atom.family((id: string) =>
  apiRuntime
    .atom(
      ApiClient.use((client) =>
        client.artifacts.get({ params: { id } })
      ).pipe(Effect.withSpan("artifacts.get", { kind: "client" }))
    )
    .pipe(Atom.keepAlive, Atom.withReactivity({ artifacts: [id] }))
);

// Un solo endpoint de escritura para el apunte: editar, añadir, reordenar, borrar y marcar son la
// misma operación (decisión 3 de la fase 2). Se manda la nota entera.
export const saveNoteAction = apiRuntime.fn(
  ({ id, input }: { readonly id: string; readonly input: SaveNoteInput }) =>
    ApiClient.use((client) =>
      client.artifacts.saveNote({ params: { id }, payload: input })
    ).pipe(Effect.withSpan("artifacts.saveNote", { kind: "client" })),
  { reactivityKeys: ["artifacts"] }
);

// Borrar un apunte para poder regenerarlo: un material tiene como mucho un apunte (fase 2, decisión 19).
export const deleteArtifactAction = apiRuntime.fn(
  (id: string) =>
    ApiClient.use((client) =>
      client.artifacts.deleteArtifact({ params: { id } })
    ).pipe(Effect.withSpan("artifacts.deleteArtifact", { kind: "client" })),
  { reactivityKeys: ["artifacts"] }
);

// Reescribir un bloque: la interfaz lo pide, el modelo devuelve una propuesta y no se guarda nada
// hasta que el alumno la acepta (fase 2, decisiones 7 y 8). Sin `reactivityKeys`: no toca el
// artefacto guardado.
export const rewriteBlockAction = apiRuntime.fn(
  ({ id, blockId, mode }: { readonly id: string; readonly blockId: string; readonly mode: RewriteMode }) =>
    ApiClient.use((client) =>
      client.artifacts.rewriteBlock({ params: { id, blockId }, payload: { mode } })
    ).pipe(Effect.withSpan("artifacts.rewriteBlock", { kind: "client" }))
);

// Traer una URL como fuente. El servidor aplica las siete guardas y devuelve el fragmento ya
// extraído; el alumno lo revisa antes de añadirlo como bloque. Sin `reactivityKeys`.
export const fetchUrlSourceAction = apiRuntime.fn(
  (url: string) =>
    ApiClient.use((client) =>
      client.artifacts.fetchUrlSource({ payload: { url } })
    ).pipe(Effect.withSpan("artifacts.fetchUrlSource", { kind: "client" }))
);

// Aceptar o descartar una propuesta del tutor (ADR-014). El servidor es la fuente de verdad: aplica
// la propuesta y, si el bloque cambió desde que el tutor lo vio, responde 409 (F2-29). Invalida el
// artefacto para que la vista refleje el bloque nuevo y la propuesta retirada.
export const acceptProposalAction = apiRuntime.fn(
  ({ id, proposalId }: { readonly id: string; readonly proposalId: string }) =>
    ApiClient.use((client) =>
      client.artifacts.acceptProposal({ params: { id, proposalId } })
    ).pipe(Effect.withSpan("artifacts.acceptProposal", { kind: "client" })),
  { reactivityKeys: ["artifacts"] }
);

export const rejectProposalAction = apiRuntime.fn(
  ({ id, proposalId }: { readonly id: string; readonly proposalId: string }) =>
    ApiClient.use((client) =>
      client.artifacts.rejectProposal({ params: { id, proposalId } })
    ).pipe(Effect.withSpan("artifacts.rejectProposal", { kind: "client" })),
  { reactivityKeys: ["artifacts"] }
);

// El tutor crea propuestas (y quizzes, y califica intentos) desde el chat, por su cuenta: eso no pasa
// por ningún atom de mutación, así que nada invalida `artifacts`. Este atom no hace nada salvo tocar
// esa etiqueta de reactividad; el chat lo dispara cuando ve que una llamada del tutor tocó artefactos,
// y así el apunte abierto (`artifactQuery(id)`) y las listas se recargan al momento.
export const invalidateArtifactsAction = apiRuntime.fn(
  (_: void) => Effect.void,
  { reactivityKeys: ["artifacts"] }
);

export const submitArtifactAttemptAction = apiRuntime.fn(
  (input: SubmitAttemptInput) =>
    ApiClient.use((client) => input.artifactKind === "quiz"
      ? client.artifacts.submit({
          params: { id: input.artifactId },
          payload: input
        })
      : client.artifacts.submit({
          params: { id: input.artifactId },
          payload: input
        })
    ).pipe(Effect.withSpan("artifacts.submit", { kind: "client" })),
  { reactivityKeys: ["artifacts"] }
);

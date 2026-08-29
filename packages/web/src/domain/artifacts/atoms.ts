import type { ArtifactKind, SaveNoteInput, SubmitAttemptInput } from "@proxus/shared";
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

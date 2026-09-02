import { Effect } from "effect";
import { ConversationStorageError, InvalidScreenContext, type ChatContextRef } from "@proxus/shared";
import type { ArtifactRepository } from "../../artifacts/artifact.ts";
import type { MaterialRepository } from "../../materials/material.ts";
import type { AssessmentLabel, ResolvedScreenRef } from "../harness/index.ts";

// Fase 5, §5.2: el contexto de pantalla se comprueba contra datos reales ANTES de describírselo al
// agente. Tres cosas dependen de esto y ninguna es cosmética:
//
// 1. La interfaz manda ids y títulos; si el material se borró en otra pestaña, o la página está fuera
//    de rango, describirla sería afirmarle a Sym una pantalla que no existe (invariante 3).
// 2. El tipo y el modo de una prueba NO viajan en la petición: se derivan aquí del artefacto real,
//    para que un título como "Examen final" no convierta un Control en un Examen (§6.4).
// 3. El título que se le cuenta al agente es el del repositorio, no el que mandó el cliente: así lo
//    que Sym lee sobre la pantalla no depende de lo que el navegador diga que hay en ella.
//
// El rechazo es un error declarado (`InvalidScreenContext`, invariante 6), nunca un `orDie` ni un
// contexto silenciosamente recortado.

const invalid = (message: string) => new InvalidScreenContext({ message });

const storageFailure = () => new ConversationStorageError({
  message: "No se pudo comprobar lo que tienes abierto en pantalla. Vuelve a intentarlo en un momento."
});

// El encabezado de un bloque: su primera línea no vacía, sin marcas de Markdown. Se deriva del
// bloque guardado y no del título que mandó el cliente, por el mismo motivo del punto 3: lo que Sym
// lee sobre la pantalla sale del repositorio. El índice de la interfaz calcula el suyo igual
// (`NoteOutline.blockHeading`), pero son dos superficies distintas y ninguna manda sobre la otra.
const BLOCK_HEADING_MAX = 80;

const blockHeading = (markdown: string): string => {
  const line = markdown
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0);
  const clean = (line ?? "").replace(/^#{1,6}\s*/, "").replace(/[*_`]/g, "").trim();
  if (clean.length === 0) {
    return "Bloque vacío";
  }
  return clean.length > BLOCK_HEADING_MAX ? `${clean.slice(0, BLOCK_HEADING_MAX)}…` : clean;
};

// Un Control es siempre práctica (no lleva `mode`); un Examen es "de prueba" o "real" según el suyo.
const assessmentLabel = (artifact: { readonly kind: "quiz" } | { readonly kind: "test"; readonly mode: "practice" | "exam" }): AssessmentLabel =>
  artifact.kind === "quiz"
    ? "Control"
    : artifact.mode === "exam" ? "Examen real" : "Examen de prueba";

export const resolveScreenContext = (
  refs: readonly ChatContextRef[],
  materialRepository: MaterialRepository,
  artifactRepository: ArtifactRepository
): Effect.Effect<readonly ResolvedScreenRef[], InvalidScreenContext | ConversationStorageError> => Effect.gen(function* () {
  // El material adjunto es el marco de todo lo demás: una página, una prueba o un bloque de OTRO
  // material no es lo que el alumno tiene delante, así que se rechaza en vez de describirse.
  const visibleMaterialId = refs.find((ref) => ref.type === "material")?.materialId;

  const getMaterial = (materialId: string) => materialRepository.get(materialId).pipe(
    Effect.mapError((error) => error._tag === "MaterialNotFound"
      ? invalid(`El contexto de pantalla apunta al material ${materialId}, que ya no existe. Quita el chip y vuelve a enviar.`)
      : storageFailure())
  );

  const getArtifact = (artifactId: string) => artifactRepository.getArtifact(artifactId).pipe(
    Effect.mapError((error) => error._tag === "ArtifactNotFound"
      ? invalid(`El contexto de pantalla apunta al artefacto ${artifactId}, que ya no existe. Quita el chip y vuelve a enviar.`)
      : storageFailure())
  );

  const belongsToVisibleMaterial = (materialId: string, what: string) =>
    visibleMaterialId === undefined || materialId === visibleMaterialId
      ? Effect.void
      : Effect.fail(invalid(`${what} pertenece al material ${materialId}, que no es el que tienes abierto. Quita el chip y vuelve a enviar.`));

  return yield* Effect.forEach(refs, (ref): Effect.Effect<ResolvedScreenRef, InvalidScreenContext | ConversationStorageError> => {
    switch (ref.type) {
      case "material":
        return getMaterial(ref.materialId).pipe(
          Effect.map((material) => ({
            kind: "material" as const,
            materialId: material.id,
            title: material.title,
            surface: ref.surface
          }))
        );

      case "page":
        return Effect.gen(function* () {
          const material = yield* getMaterial(ref.materialId);
          yield* belongsToVisibleMaterial(ref.materialId, `La página adjunta`);
          if (!Number.isInteger(ref.page) || ref.page < 1 || ref.page > material.pageCount) {
            return yield* invalid(
              `La página ${ref.page} no existe en "${material.title}", que tiene ${material.pageCount} páginas. Quita el chip y vuelve a enviar.`
            );
          }
          return {
            kind: "page" as const,
            materialId: material.id,
            materialTitle: material.title,
            page: ref.page
          };
        });

      case "assessment":
        return Effect.gen(function* () {
          const artifact = yield* getArtifact(ref.artifactId);
          if (artifact.kind === "note") {
            return yield* invalid(
              `El contexto de pantalla dice que hay abierta una prueba con id ${ref.artifactId}, pero ese artefacto es un apunte. Quita el chip y vuelve a enviar.`
            );
          }
          yield* belongsToVisibleMaterial(artifact.scope.materialId, `La prueba adjunta`);
          return {
            kind: "assessment" as const,
            artifactId: artifact.id,
            title: artifact.title,
            assessment: assessmentLabel(artifact),
            view: ref.view
          };
        });

      // El apunte abierto en la pestaña "Apuntes". Una prueba no entra por aquí: tiene su propia
      // referencia, que además declara qué vista se está mirando.
      case "artifact":
        return Effect.gen(function* () {
          const artifact = yield* getArtifact(ref.artifactId);
          if (artifact.kind !== "note") {
            return yield* invalid(
              `El contexto de pantalla dice que hay abierto un apunte con id ${ref.artifactId}, pero ese artefacto es una prueba. Quita el chip y vuelve a enviar.`
            );
          }
          yield* belongsToVisibleMaterial(artifact.materialId, `El apunte adjunto`);
          return { kind: "note" as const, artifactId: artifact.id, title: artifact.title };
        });

      case "block":
        return Effect.gen(function* () {
          const artifact = yield* getArtifact(ref.artifactId);
          if (artifact.kind !== "note") {
            return yield* invalid(
              `El contexto de pantalla apunta a un bloque del artefacto ${ref.artifactId}, que no es un apunte. Quita el chip y vuelve a enviar.`
            );
          }
          yield* belongsToVisibleMaterial(artifact.materialId, `El bloque adjunto`);
          const block = artifact.blocks.find((candidate) => candidate.id === ref.blockId);
          if (block === undefined) {
            return yield* invalid(
              `El apunte "${artifact.title}" ya no tiene el bloque ${ref.blockId}. Quita el chip y vuelve a enviar.`
            );
          }
          return {
            kind: "block" as const,
            artifactId: artifact.id,
            blockId: block.id,
            title: blockHeading(block.markdown)
          };
        });
    }
  });
});

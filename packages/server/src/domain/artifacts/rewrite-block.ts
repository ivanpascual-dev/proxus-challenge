import { Effect } from "effect";
import { LanguageModel } from "effect/unstable/ai";
import { RewriteFailed, type RewriteMode, type RewrittenBlock } from "@proxus/shared";
import { REWRITE_BLOCK_PROMPT } from "./rewrite-block-prompts.ts";

// Reescribe UN bloque con una sola llamada al modelo (fase 2, decisiones 7 y 8). Lo pide la
// interfaz a un endpoint propio, no el tutor por el chat: es un botón sobre un bloque, no una
// conversación. Recibe solo el texto del bloque y su fragmento cacheado (F2-17): sin historial, sin
// imágenes, sin releer el PDF. Devuelve texto y no guarda nada.

export interface RewriteBlockTarget {
  readonly markdown: string;
  // El fragmento cacheado del bloque, si lo tiene. Lo copió el servidor del índice o de la URL
  // (invariante 8): aquí solo se lee.
  readonly excerpt: string | null;
}

const hasSource = (target: RewriteBlockTarget): boolean =>
  target.excerpt !== null && target.excerpt.trim().length > 0;

const userMessage = (target: RewriteBlockTarget, mode: RewriteMode): string => {
  const fuente = hasSource(target)
    ? target.excerpt
    : "(este bloque no tiene fragmento cacheado; reescribe solo con el BLOQUE)";
  return `MODO: ${mode}\n\nBLOQUE:\n${target.markdown}\n\nFUENTE:\n${fuente}`;
};

export const rewriteBlock = (
  target: RewriteBlockTarget,
  mode: RewriteMode
): Effect.Effect<RewrittenBlock, RewriteFailed, LanguageModel.LanguageModel> =>
  Effect.gen(function* () {
    // `usedSource` lo decide el servidor mirando si había fragmento, nunca el modelo (F2-19).
    const usedSource = hasSource(target);

    const response = yield* LanguageModel.generateText({
      prompt: [
        { role: "system", content: REWRITE_BLOCK_PROMPT },
        { role: "user", content: userMessage(target, mode) }
      ]
    }).pipe(
      Effect.tapError((error) => Effect.logWarning(`reescritura de bloque: el modelo falló: ${String(error)}`)),
      Effect.mapError(() => new RewriteFailed({
        reason: "el modelo no respondió",
        message: "La reescritura falló: el modelo no respondió. Vuelve a intentarlo."
      }))
    );

    const markdown = response.text.trim();
    if (markdown.length === 0) {
      // Invariante 3: no se disfraza una respuesta vacía con el texto original.
      return yield* new RewriteFailed({
        reason: "respuesta vacía",
        message: "La reescritura falló: el modelo devolvió una respuesta vacía."
      });
    }

    return { markdown, usedSource };
  });

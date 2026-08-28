import { Context, Data, Effect } from "effect";
import type { PageImage } from "./material.ts";

export class PdfServiceError extends Data.TaggedError("PdfServiceError")<{
  readonly reason: unknown;
}> {}

export interface PdfService {
  readonly pageCount: (path: string) => Effect.Effect<number, PdfServiceError>;
  // Renderiza a PNG con el lado corto a LIMITS.renderShortSidePixels (ver render-scale.ts): una sola
  // regla que sirve para diapositivas 16:9 y para A4 sin pagar bytes que Gemini descarta.
  readonly renderPage: (input: {
    readonly path: string;
    readonly page: number;
  }) => Effect.Effect<PageImage, PdfServiceError>;
  // Texto embebido de UNA página, tal cual sale del PDF. Vacío o casi vacío en páginas que son
  // imagen: eso es lo que el clasificador de densidad usa para decidir si hay que transcribir.
  readonly extractText: (input: {
    readonly path: string;
    readonly page: number;
  }) => Effect.Effect<string, PdfServiceError>;
}

export const PdfService = Context.Service<PdfService>(
  "@proxus/server/materials/PdfService"
);

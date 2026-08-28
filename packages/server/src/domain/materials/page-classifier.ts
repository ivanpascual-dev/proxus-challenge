import { LIMITS } from "@proxus/shared";

// De dónde salió el texto indexado de una página. "extracted" = venía embebido en el PDF;
// "transcribed" = lo escribió el modelo mirando la imagen. La invariante 8 exige que se vea.
export type PageProvenance = "extracted" | "transcribed";

// Cuenta caracteres NO BLANCOS, que es como se calibró el umbral el 2026-08-28: el hueco del corpus
// está entre 541 y 853, y `LIMITS.textDensityThreshold` (600) cae en mitad.
export const countDenseCharacters = (text: string): number => text.replace(/\s/g, "").length;

export const classifyPage = (extractedText: string): PageProvenance =>
  countDenseCharacters(extractedText) >= LIMITS.textDensityThreshold ? "extracted" : "transcribed";

import { isMaterialPageImages } from "../../materials/material.ts";
import type { AgentMessage } from "./message.ts";

// Palanca 1 (fase 4, decisión 10): una imagen de página vive el turno en que se pide. Al cerrar el
// turno se sustituye por su descripción textual, de forma definitiva y también en disco: si el
// modelo la necesita después, la vuelve a pedir y el presupuesto se la cobra otra vez.
//
// Determinista e idempotente a propósito: la palanca 2 (caché implícita de Gemini) necesita que el
// prefijo sea estable, así que degradar dos veces tiene que dar el mismo resultado que degradar una.
export const degradeImages = (message: AgentMessage): AgentMessage => {
  if (message.role !== "tool-result" || !isMaterialPageImages(message.result)) {
    return message;
  }

  const result = message.result;

  return {
    ...message,
    result: {
      type: "material-page-images" as const,
      material: result.material,
      pages: result.pages.map((page) => ({ page: page.page, mediaType: page.mediaType })),
      omitted: true
    }
  };
};

export const degradeHistory = (
  messages: readonly AgentMessage[]
): readonly AgentMessage[] => messages.map(degradeImages);

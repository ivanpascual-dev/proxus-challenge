import { Schema } from "effect";
import { NoteGenerationStreamEvent, type NoteGenerationStreamEvent as NoteGenerationStreamEventType } from "@proxus/shared";
import { apiClientConfig } from "../../api-client/config.ts";

const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(NoteGenerationStreamEvent));

// Consume el stream NDJSON de POST /api/materials/:id/notes: progreso tema a tema y un done (con el
// resumen del apunte) o failed final. Mismo patrón que streamReindexMaterial: generar apuntes es un
// servicio del dominio con su ruta, no una capacidad del tutor (fase 2, decisión 24).
export async function* streamGenerateNotes(materialId: string): AsyncGenerator<NoteGenerationStreamEventType> {
  const response = await fetch(`${apiClientConfig.apiUrl}/api/materials/${encodeURIComponent(materialId)}/notes`, {
    method: "POST",
    headers: { accept: "application/x-ndjson" }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.body === null) {
    throw new Error("La respuesta de generación de apuntes no trae cuerpo");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        yield decodeEvent(trimmed);
      }
    }
  }

  const remaining = (buffer + decoder.decode()).trim();
  if (remaining.length > 0) {
    yield decodeEvent(remaining);
  }
}

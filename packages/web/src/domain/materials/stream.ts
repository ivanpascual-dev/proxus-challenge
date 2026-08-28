import { Schema } from "effect";
import { MaterialIndexStreamEvent, type MaterialIndexStreamEvent as MaterialIndexStreamEventType } from "@proxus/shared";
import { apiClientConfig } from "../../api-client/config.ts";

const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(MaterialIndexStreamEvent));

// Consume el stream NDJSON de POST /api/materials/:id/index: eventos de progreso y un done/failed
// final. Mismo patrón que domain/tutor/stream.ts.
export async function* streamReindexMaterial(materialId: string): AsyncGenerator<MaterialIndexStreamEventType> {
  const response = await fetch(`${apiClientConfig.apiUrl}/api/materials/${encodeURIComponent(materialId)}/index`, {
    method: "POST",
    headers: { accept: "application/x-ndjson" }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
  if (response.body === null) {
    throw new Error("La respuesta de indexación no trae cuerpo");
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

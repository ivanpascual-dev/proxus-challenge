import { Schema } from "effect";
import {
  AssessmentGenerationStreamEvent,
  type AssessmentGenerationStreamEvent as AssessmentGenerationStreamEventType,
  type GenerateAssessmentInput
} from "@proxus/shared";
import { apiClientConfig } from "../../api-client/config.ts";

const decodeEvent = Schema.decodeUnknownSync(Schema.fromJsonString(AssessmentGenerationStreamEvent));

// Consume el stream NDJSON de POST /api/materials/:id/assessments: progreso tema a tema y un done
// (con el resumen de la prueba) o failed final. Mismo patrón que streamGenerateNotes: transformar un
// material en una prueba es un servicio del dominio con su ruta, no una capacidad del tutor
// (ADR-016).
export async function* streamGenerateAssessment(
  materialId: string,
  input: GenerateAssessmentInput
): AsyncGenerator<AssessmentGenerationStreamEventType> {
  const response = await fetch(
    `${apiClientConfig.apiUrl}/api/materials/${encodeURIComponent(materialId)}/assessments`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify(input)
    }
  );

  if (!response.ok) {
    // 400 (rango), 404 (material), 409 (tope) y 429 (frecuencia) llegan como JSON con `message`.
    const raw = await response.text();
    let message = raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object" && "message" in parsed && typeof parsed.message === "string") {
        message = parsed.message;
      }
    } catch {
      // no era JSON: se usa el texto tal cual
    }
    throw new Error(message);
  }
  if (response.body === null) {
    throw new Error("La respuesta de generación de la prueba no trae cuerpo");
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

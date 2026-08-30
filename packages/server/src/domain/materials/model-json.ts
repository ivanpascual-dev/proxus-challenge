// El adaptador de Gemini (domain/agents/gemini.ts) manda `generationConfig` con temperatura y tope
// de salida, pero NO `responseMimeType` ni `responseSchema` (gemini.ts:206-215), así que no hay modo
// JSON forzado: la respuesta puede venir con una valla de markdown o con texto alrededor. Este
// parseo es defensivo. Si no se puede sacar un objeto, lanza, y quien llama declara el fallo
// (failedPages para una página, IndexingError para la llamada de temas). Nunca devuelve un valor
// neutro (invariante 3). El modo JSON forzado llega en el tramo 3B (§6.7.1) como una segunda capa.

export const parseModelJson = (raw: string): unknown => {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("la respuesta del modelo no contiene un objeto JSON");
  }
  return JSON.parse(withoutFences.slice(start, end + 1)) as unknown;
};

export interface TranscriptionResult {
  readonly text: string;
  readonly isBlank: boolean;
}

// Espera { "text": "...", "isBlank": false }. isBlank ausente se trata como false.
export const parseTranscription = (raw: string): TranscriptionResult => {
  const value = parseModelJson(raw);
  if (typeof value !== "object" || value === null) {
    throw new Error("la transcripción no es un objeto");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text !== "string") {
    throw new Error("la transcripción no trae un campo `text` de tipo string");
  }
  return { text: record.text, isBlank: record.isBlank === true };
};

export interface ParsedTopic {
  readonly id: string;
  readonly label: string;
  readonly pages: readonly number[];
  // Referencia cruda al padre tal cual la devolvió el modelo. La coherencia (que exista, que no haya
  // ciclos, que no baje de dos niveles) la impone normalizeTopicHierarchy, no este parseo.
  readonly parent: string | null;
}

// Espera { "topics": [{ "id": "kebab-case", "label": "...", "pages": [1, 2], "parent": null }] }.
export const parseTopics = (raw: string): readonly ParsedTopic[] => {
  const value = parseModelJson(raw);
  if (typeof value !== "object" || value === null || !Array.isArray((value as { topics?: unknown }).topics)) {
    throw new Error("la respuesta de temas no trae un array `topics`");
  }
  return (value as { topics: readonly unknown[] }).topics.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`el tema ${index} no es un objeto`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.label !== "string" || !Array.isArray(record.pages)) {
      throw new Error(`el tema ${index} no tiene id, label y pages`);
    }
    const pages = record.pages.filter((page): page is number => typeof page === "number" && Number.isInteger(page));
    const parent = typeof record.parent === "string" && record.parent.length > 0 ? record.parent : null;
    return { id: record.id, label: record.label, pages, parent };
  });
};

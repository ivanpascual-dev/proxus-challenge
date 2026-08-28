export const LIMITS = {
  // Tamaño de entrada
  maxMessageCharacters: 2_000,
  maxPastedCharactersPerTurn: 12_000,
  maxHistoryMessages: 400,
  maxHistoryCharacters: 200_000,
  maxBlockCharacters: 5_000,
  maxUploadBytes: 25 * 1024 * 1024,
  maxMaterials: 5,

  // Coste por turno
  maxPagesPerTurn: 20,
  maxTurnImageBytes: 12 * 1024 * 1024, // base64, medido en la fase 1
  maxAgentSteps: 8,

  // Frecuencia
  messagesPerWindow: { limit: 20, windowMs: 10 * 60 * 1000 },
  messagesPerDay: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
  artifactsPerWindow: { limit: 5, windowMs: 10 * 60 * 1000 },
  artifactsPerDay: { limit: 40, windowMs: 24 * 60 * 60 * 1000 },
  maxConcurrentRequests: 3,

  // Tamaño de salida
  maxQuestionsPerArtifact: 50,
  maxBlocksPerNote: 200,
  maxTopicsPerMaterial: 40,
  maxTopicsPerPage: 3,
  maxIndexedCharactersPerPage: 8_000,

  // Tiempo
  modelCallTimeoutMs: 60_000,
  externalFetchTimeoutMs: 5_000,
  maxExternalFetchBytes: 2 * 1024 * 1024,

  // Indexado y renderizado
  textDensityThreshold: 600, // caracteres no blancos, calibrado 2026-08-28
  renderShortSidePixels: 1_152,
  indexConcurrency: 4
} as const;

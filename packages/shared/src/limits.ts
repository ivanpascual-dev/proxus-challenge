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
  maxAgentSteps: 12, // holgura para el camino de generación de apuntes (fase 2, decisión 22); sigue lejos del riesgo de ADR-007

  // Frecuencia
  messagesPerWindow: { limit: 20, windowMs: 10 * 60 * 1000 },
  messagesPerDay: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
  artifactsPerWindow: { limit: 5, windowMs: 10 * 60 * 1000 },
  artifactsPerDay: { limit: 40, windowMs: 24 * 60 * 60 * 1000 },
  maxConcurrentRequests: 3,

  // Pruebas (fase 3)
  // Cuántas preguntas: lo elige el alumno dentro de su rango. El reparto por tipo lo pone el código.
  questionsPerQuiz: { min: 4, max: 8, default: 6 },
  questionsPerTest: { min: 10, max: 30, default: 20 },

  // Cuántas pruebas y cuántos intentos.
  maxQuizzesPerTopic: 2, // por tema, no por material: el techo va donde va el alcance del Control
  maxTestsPerMaterial: 4,
  maxPracticeAttemptsPerAssessment: 3,
  maxExamAttemptsPerAssessment: 3,

  // Generación: se completa hasta el número pedido o se falla (decisión 21).
  maxGenerationRetriesPerTopic: 2,

  maxHintCharacters: 300,
  maxOpenAnswerCharacters: 1_500,
  maxRubricCriteria: 5,
  maxJudgeCallsPerAttempt: 8, // el reparto acota el Examen más grande a 6; esto es el fusible
  examSecondsPerQuestion: {
    "multiple-choice": 60,
    "multiple-response": 90,
    "true-false": 30,
    "short-answer": 120
  },
  examReviewSeconds: 300,
  examHeartbeatIntervalMs: 15_000, // mide el tiempo conectado; no cancela nada (decisión 19c)

  // Tamaño de salida
  maxQuestionsPerArtifact: 50,
  maxBlocksPerNote: 200,
  maxNoteTitleCharacters: 200,
  maxSourceExcerptCharacters: 4_000, // fragmento cacheado por bloque
  maxPendingProposalsPerNote: 20,
  maxIndexTextPagesPerRead: 20, // el mismo techo que las imágenes, por coherencia
  maxIndexTextCharactersPerTurn: 60_000, // ~15.000 tokens; 20 páginas A4 indexadas son ~44.000 caracteres
  maxTopicsPerMaterial: 40,
  maxTopicsPerPage: 3,
  maxIndexedCharactersPerPage: 8_000,

  // Modelo
  modelTemperature: 0.2, // baja y fija: respuesta reproducible y JSON de indexación estable (ADR-008, capa 4)
  maxModelOutputTokens: 8_192,

  // Tiempo
  modelCallTimeoutMs: 60_000,
  externalFetchTimeoutMs: 5_000,
  maxExternalFetchBytes: 2 * 1024 * 1024,

  // Indexado y renderizado
  textDensityThreshold: 600, // caracteres no blancos, calibrado 2026-08-28
  renderShortSidePixels: 1_152,
  indexConcurrency: 4
} as const;

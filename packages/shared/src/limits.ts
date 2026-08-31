export const LIMITS = {
  // Tamaño de entrada
  maxMessageCharacters: 2_000,
  maxPastedCharactersPerTurn: 12_000,
  maxHistoryMessages: 400,
  maxHistoryCharacters: 200_000,
  maxBlockCharacters: 5_000,
  maxUploadBytes: 25 * 1024 * 1024,
  maxMaterials: 5,
  maxFilesPerUpload: 5,

  // Coste por turno
  maxPagesPerTurn: 20,
  maxTurnImageBytes: 12 * 1024 * 1024, // base64, medido en la fase 1
  maxAgentSteps: 12, // holgura para el camino de generación de apuntes (fase 2, decisión 22); sigue lejos del riesgo de ADR-007

  // Frecuencia
  messagesPerWindow: { limit: 20, windowMs: 10 * 60 * 1000 },
  messagesPerDay: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
  artifactsPerWindow: { limit: 5, windowMs: 10 * 60 * 1000 },
  artifactsPerDay: { limit: 40, windowMs: 24 * 60 * 60 * 1000 },
  // Documentos por día (fase 4, decisión 4). No es lo mismo que `maxMaterials`: este frena la
  // FRECUENCIA de subidas (el bucle subir-borrar-subir para explotar la gracia de alta), no cuántos
  // materiales hay vivos a la vez.
  uploadsPerWindow: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  maxConcurrentRequests: 3,
  // Gracia de alta: un material recién subido no cobra el cubo `artifacts` en su primer indexado y su
  // primera generación de apuntes, porque subir ya se cobró contra `uploadsPerWindow` (fase 4, decisión 4).
  uploadGraceMs: 10 * 60 * 1000,

  // Pruebas (fase 3)
  // Cuántas preguntas: lo elige el alumno dentro de su rango. El reparto por tipo lo pone el código.
  questionsPerQuiz: { min: 4, max: 8, default: 6 },
  questionsPerTest: { min: 10, max: 30, default: 20 },

  // Cuántas pruebas y cuántos intentos.
  maxQuizzesPerTopic: 2, // por tema, no por material: el techo va donde va el alcance del Control
  maxTestsPerMaterial: 2, // por modo: 2 Exámenes de prueba y 2 Exámenes reales por material
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
  // Un silencio del latido más largo que esto es una interrupción: el hueco no cuenta como tiempo
  // conectado y se guarda en `interruptions` (decisión 19c). Tres latidos perdidos.
  examInterruptionThresholdMs: 45_000,
  // Margen sobre el tiempo límite dentro del cual el servidor todavía acepta una entrega: cubre la
  // latencia de red y el desfase de reloj de la entrega automática del cliente. Pasado esto, 409
  // `TimeLimitExceeded` (decisión 9: quien decide si llegó tarde es el servidor).
  examSubmitGraceSeconds: 15,

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
  jsonModelTemperature: 0, // camino JSON (generación de preguntas y juez): 0 para corregir igual dos veces (ADR-008, capa 4)
  // El techo de salida es el fusible contra una salida desbocada, no un control de coste: se paga por
  // lo generado, no por el techo (fase 4, sección 4.2). Cada valor es el doble del caso peor calculado
  // de ese camino, pensamiento incluido donde lo lleve, sin pasar del límite del modelo (65.536).
  modelOutputTokens: {
    tutor: 4_096, // respuesta larga (~1.500) + bloque de seguimiento (~120)
    indexing: 4_096, // maxIndexedCharactersPerPage (8.000 caracteres) ≈ 2.500
    note: 4_096, // medido: 842 de salida + 1.602 de pensamiento = 2.444
    quiz: 8_192, // 8 preguntas × ~200 = 1.600
    test: 16_384, // 30 preguntas × ~200 = 6.000, + ~1.600 de pensamiento = 7.600
    judge: 4_096 // criterios y comentario (~1.000) + ~1.600 de pensamiento
  },

  // Tiempo
  modelCallTimeoutMs: 60_000,
  externalFetchTimeoutMs: 5_000,
  maxExternalFetchBytes: 2 * 1024 * 1024,

  // Indexado y renderizado
  textDensityThreshold: 600, // caracteres no blancos, calibrado 2026-08-28
  renderShortSidePixels: 1_152,
  indexConcurrency: 4
} as const;

// Frontera única entre lo que falla y lo que ve el alumno (fase 5, §4.2). Ningún componente decide
// por su cuenta qué parte de una excepción enseñar: aquí se traduce una causa a `UserNotice` (lo que
// se pinta) y, por separado, a un registro de diagnóstico (lo que se conserva para depurar).
//
// Los errores de contrato de `@proxus/shared` llegan con `message` redactado a mano en el handler del
// servidor (ver `packages/shared/src/errors/*.ts`): para esos, mostrar `message` es seguro. Para
// cualquier otra causa (fallo de red, excepción no decodificada, defecto), `message` puede llevar
// texto interno y nunca se muestra: se sustituye por copy específico de la operación.

export type NoticeTone = "info" | "success" | "warning" | "danger";
export type NoticeAction = "retry" | "new-conversation" | "open-material" | "dismiss";

export interface UserNotice {
  readonly tone: NoticeTone;
  readonly title: string;
  readonly description?: string;
  readonly action?: NoticeAction;
}

export type UserOperation =
  | { readonly area: "materials"; readonly action: "list" | "upload" | "delete" | "page" | "index" }
  | { readonly area: "notes"; readonly action: "load" | "generate" | "save" | "delete" | "proposal" | "source" }
  | { readonly area: "assessments"; readonly action: "list" | "generate" | "load" | "hint" | "history" | "delete" }
  | { readonly area: "attempts"; readonly action: "start" | "save" | "submit" | "resume" | "cancel" }
  | { readonly area: "profile"; readonly action: "load" }
  | { readonly area: "chat"; readonly action: "list" | "create" | "load" | "send" | "delete" };

// Un `defect` es un fallo del propio código, no una condición esperada: al usuario no se le enseña
// ningún detalle, solo que algo ha ido mal.
export const DEFECT_MESSAGE = "Algo ha ido mal en la aplicación. Recarga la página y vuelve a intentarlo.";

// Lista cerrada de errores de dominio declarados en `packages/shared/src/errors/*.ts`. Ampliarla exige
// añadir aquí el `_tag` nuevo; un `_tag` que no esté en esta lista se trata como causa desconocida.
const DOMAIN_ERROR_TAGS = new Set([
  // material-errors.ts
  "MaterialNotFound",
  "MaterialNotIndexed",
  "PageOutOfRange",
  "MaterialIndexingFailed",
  "MaterialStorageError",
  "UnsupportedFileType",
  "MaterialAlreadyExists",
  "TooManyMaterials",
  // artifact-errors.ts
  "ArtifactNotFound",
  "ArtifactTypeMismatch",
  "NoteLimitExceeded",
  "UnknownBlock",
  "BlockNotFound",
  "ProposalNotFound",
  "ProposalStale",
  "TooManyProposals",
  "RewriteFailed",
  "UrlRejected",
  "UrlFetchFailed",
  "ArtifactStorageError",
  // assessment-errors.ts
  "AttemptNotFound",
  "AttemptLimitExceeded",
  "AttemptInProgress",
  "AttemptAlreadyClosed",
  "TimeLimitExceeded",
  "HintNotAvailable",
  "AttemptNotGraded",
  "QuestionNotFound",
  "ExamInProgress",
  "AssessmentLimitExceeded",
  // conversation-errors.ts
  "ConversationNotFound",
  "ConversationStorageError",
  // limit-exceeded.ts
  "LimitExceeded",
  "RateLimited",
  // assessment-generation.ts: rechazo del precheck (rango, tope, material sin indexar) o de cuerpo
  // mal formado, antes de abrir el stream de generación.
  "AssessmentGenerationRejected"
]);

// Estos tags son un fallo real de infraestructura, no una condición esperada del dominio: se marcan
// como `danger` con acción de reintentar. El resto son condiciones que el propio dominio previó
// (límite, no encontrado, estado en conflicto) y se marcan como `warning`.
const INFRASTRUCTURE_FAILURE_TAGS = new Set([
  "MaterialIndexingFailed",
  "MaterialStorageError",
  "ArtifactStorageError",
  "ConversationStorageError",
  "RewriteFailed",
  "UrlFetchFailed"
]);

interface DomainErrorShape {
  readonly _tag: string;
  readonly message: string;
}

const asDomainError = (cause: unknown): DomainErrorShape | null => {
  if (typeof cause !== "object" || cause === null) return null;
  if (!("_tag" in cause) || !("message" in cause)) return null;
  const tag = (cause as { _tag: unknown })._tag;
  const message = (cause as { message: unknown }).message;
  if (typeof tag !== "string" || typeof message !== "string") return null;
  if (!DOMAIN_ERROR_TAGS.has(tag) || message.trim().length === 0) return null;
  return { _tag: tag, message };
};

const GENERIC_FALLBACK = "Tus datos anteriores siguen guardados. Vuelve a intentarlo.";

interface OperationFallback {
  readonly title: string;
  readonly description: string;
}

// Tipo distribuido sobre la unión discriminada `UserOperation`: para cada variante, la clave es su
// `area` y el valor exige exactamente sus `action` posibles. Un `area` o `action` fuera del contrato
// no compila, y ninguno queda sin copy de respaldo.
type OperationFallbackMap = {
  readonly [Op in UserOperation as Op["area"]]: {
    readonly [Action in Op["action"]]: OperationFallback;
  };
};

const OPERATION_FALLBACK: OperationFallbackMap = {
  materials: {
    list: { title: "No se pudo cargar la lista de materiales.", description: GENERIC_FALLBACK },
    upload: { title: "No se pudo completar la subida.", description: "El material no se guardó. Vuelve a intentarlo." },
    delete: { title: "No se pudo borrar el material.", description: "El material sigue en tu lista. Vuelve a intentarlo." },
    page: { title: "No hemos podido abrir esta página.", description: "El resto del material sigue disponible." },
    index: { title: "No se pudo indexar el material.", description: GENERIC_FALLBACK }
  },
  notes: {
    load: { title: "No se pudieron cargar los apuntes.", description: GENERIC_FALLBACK },
    generate: { title: "No se pudo generar el apunte.", description: GENERIC_FALLBACK },
    save: { title: "No se pudo guardar el apunte.", description: "Tu borrador sigue en pantalla. Vuelve a intentarlo." },
    delete: { title: "No se pudo borrar el bloque.", description: GENERIC_FALLBACK },
    proposal: { title: "No se pudo cargar la propuesta.", description: GENERIC_FALLBACK },
    source: { title: "No se pudo añadir la fuente.", description: GENERIC_FALLBACK }
  },
  assessments: {
    list: { title: "No se pudieron cargar las pruebas.", description: GENERIC_FALLBACK },
    generate: { title: "No se pudo generar la prueba.", description: GENERIC_FALLBACK },
    load: { title: "No se pudo cargar la prueba.", description: GENERIC_FALLBACK },
    hint: { title: "No se pudo pedir la pista.", description: GENERIC_FALLBACK },
    history: { title: "No se pudo cargar el historial.", description: GENERIC_FALLBACK },
    delete: { title: "No se pudo borrar la prueba.", description: "La prueba sigue en tu lista. Vuelve a intentarlo." }
  },
  attempts: {
    start: { title: "No se pudo empezar el intento.", description: GENERIC_FALLBACK },
    save: { title: "No se pudo guardar tu respuesta.", description: "Tu respuesta anterior sigue guardada. Vuelve a intentarlo." },
    submit: { title: "No se pudo entregar el intento.", description: "Tus respuestas siguen guardadas. Vuelve a intentarlo." },
    resume: { title: "No se pudo reanudar el intento.", description: GENERIC_FALLBACK },
    cancel: { title: "No se pudo cancelar el intento.", description: GENERIC_FALLBACK }
  },
  profile: {
    load: { title: "No se pudo cargar tu progreso.", description: GENERIC_FALLBACK }
  },
  chat: {
    list: { title: "No se pudieron cargar tus conversaciones.", description: GENERIC_FALLBACK },
    create: { title: "No se pudo crear la conversación.", description: GENERIC_FALLBACK },
    load: { title: "No se pudo cargar la conversación.", description: GENERIC_FALLBACK },
    send: { title: "No hemos podido conectar con Sym.", description: "Comprueba tu conexión y vuelve a intentarlo." },
    delete: { title: "No se pudo borrar la conversación.", description: GENERIC_FALLBACK }
  }
};

const fallbackFor = (operation: UserOperation): OperationFallback => {
  const forArea = OPERATION_FALLBACK[operation.area] as Record<string, OperationFallback>;
  return forArea[operation.action]!;
};

// Convierte una causa en lo único que el alumno debe ver. Un error de dominio reconocido usa el
// `message` que ya redactó el servidor; cualquier otra causa usa copy fijo de la operación, nunca su
// `message`.
export const toUserNotice = (cause: unknown, operation: UserOperation): UserNotice => {
  const domainError = asDomainError(cause);
  const fallback = fallbackFor(operation);
  if (domainError === null) {
    return { tone: "danger", title: fallback.title, description: fallback.description, action: "retry" };
  }
  const isInfrastructureFailure = INFRASTRUCTURE_FAILURE_TAGS.has(domainError._tag);
  return {
    tone: isInfrastructureFailure ? "danger" : "warning",
    title: fallback.title,
    description: domainError.message,
    action: isInfrastructureFailure ? "retry" : "dismiss"
  };
};

// Claves, tokens y cuerpos binarios que nunca deben llegar a un log de navegador, aunque vengan
// dentro de una causa desconocida. Se reutiliza también en `activity-detail.ts` (fase 5, §4.4): el
// segundo nivel de la actividad del agente tiene el mismo problema con el `result` de una herramienta.
export const REDACT_KEY_PATTERN = /key|token|secret|password|authorization|cookie/i;
export const BASE64_LIKE_PATTERN = /^[A-Za-z0-9+/]{200,}={0,2}$/;

export const redactForLog = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[omitido]";
  if (typeof value === "string") {
    return BASE64_LIKE_PATTERN.test(value) ? "[binario omitido]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = REDACT_KEY_PATTERN.test(key) ? "[omitido]" : redactForLog(item, depth + 1);
    }
    return result;
  }
  return value;
};

// Registra la causa técnica completa para quien depure, redactada de secretos y binarios, junto a la
// operación y la superficie donde ocurrió. Nunca llega a pantalla: es el otro extremo de la frontera.
// Un error de dominio reconocido (condición prevista, tono `warning`) se registra con `console.warn`;
// cualquier otra causa, con `console.error`.
export const reportDiagnostic = (
  cause: unknown,
  context: { readonly operation: UserOperation; readonly surface: string }
): void => {
  const domainError = asDomainError(cause);
  const isKnownDomainWarning = domainError !== null && !INFRASTRUCTURE_FAILURE_TAGS.has(domainError._tag);
  const log = isKnownDomainWarning ? console.warn : console.error;
  log(`[${context.surface}] ${context.operation.area}.${context.operation.action}`, redactForLog(cause));
};

// Atajo para el caso común: traduce la causa a lo que ve el alumno y, en el mismo paso, deja el
// diagnóstico técnico en consola. La mayoría de componentes solo necesitan esta función.
export const describeFailure = (
  cause: unknown,
  operation: UserOperation,
  surface: string
): UserNotice => {
  reportDiagnostic(cause, { operation, surface });
  return toUserNotice(cause, operation);
};

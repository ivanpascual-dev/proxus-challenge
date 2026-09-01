import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { Multipart } from "effect/unstable/http";
import { LIMITS, LimitExceeded, MultipartLimitGuard } from "@proxus/shared";

// La implementación de `MultipartLimitGuard` (contrato en `packages/shared`). Ver el comentario de
// ese fichero para el porqué: el `HttpApiBuilder` de esta beta envuelve la decodificación multipart
// con `Effect.orDie`, así que un fichero o una subida por encima del techo llega aquí como un
// **defecto**, no como un fallo tipado, y `Effect.catchDefect` es el único punto donde se puede
// interceptar antes de que se convierta en un 500 mudo.

// El `NodeMultipart.persisted` de esta beta (`NodeMultipart.ts:69-73`) envuelve CUALQUIER fallo de su
// pipeline de escritura a disco como `"InternalError"`, perdiendo el motivo real cuando ese fallo es
// en verdad un límite alcanzado a mitad de la escritura (un fichero de más de `maxUploadBytes`, por
// ejemplo). La causa original de `multipasta` sigue colgando de `reason.cause` con esta forma; se
// reclasifica aquí, con la misma tabla que usa el propio adaptador para los casos que sí clasifica
// bien (`NodeMultipart.ts:161-183`).
type ReachedLimitCause = {
  readonly _tag: "ReachedLimit";
  readonly limit: "MaxParts" | "MaxTotalSize" | "MaxPartSize" | "MaxFieldSize";
};

const isReachedLimitCause = (cause: unknown): cause is ReachedLimitCause =>
  typeof cause === "object" && cause !== null
    && (cause as { _tag?: unknown })._tag === "ReachedLimit"
    && typeof (cause as { limit?: unknown }).limit === "string";

type LimitReason = "FileTooLarge" | "BodyTooLarge" | "TooManyParts" | "FieldTooLarge";

const reachedLimitToReason: Record<ReachedLimitCause["limit"], LimitReason> = {
  MaxParts: "TooManyParts",
  MaxFieldSize: "FieldTooLarge",
  MaxPartSize: "FileTooLarge",
  MaxTotalSize: "BodyTooLarge"
};

// `null` significa "no es un límite, es un fallo interno de verdad": se deja morir como defecto, para
// no disfrazar un fallo real de disco de "límite superado" (invariante 3, en la otra dirección).
const resolveLimitReason = (error: Multipart.MultipartError): LimitReason | null => {
  const tag = error.reason._tag;
  if (tag === "FileTooLarge" || tag === "BodyTooLarge" || tag === "TooManyParts" || tag === "FieldTooLarge") {
    return tag;
  }
  if (tag === "InternalError" && isReachedLimitCause(error.reason.cause)) {
    return reachedLimitToReason[error.reason.cause.limit];
  }
  return null;
};

// `Content-Length` es el único dato real que tenemos de cuánto mandó el cliente cuando el límite
// corta la subida a mitad: multipasta no expone el conteo de bytes ni de partes ya vistas en el
// error. Si falta (posible con transferencia troceada), se reporta la cota mínima que se sabe cierta
// por el hecho mismo de haber saltado el límite: nunca un cero ni una estimación inventada.
const receivedBytes = (request: HttpServerRequest.HttpServerRequest, floor: number): number => {
  const contentLength = Number(request.headers["content-length"]);
  return Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : floor + 1;
};

const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024));

const toLimitExceeded = (reason: LimitReason, request: HttpServerRequest.HttpServerRequest): LimitExceeded => {
  switch (reason) {
    case "FileTooLarge":
      return new LimitExceeded({
        limit: "maxUploadBytes",
        ceiling: LIMITS.maxUploadBytes,
        received: receivedBytes(request, LIMITS.maxUploadBytes),
        message: `Algún fichero supera el máximo permitido por fichero (${megabytes(LIMITS.maxUploadBytes)} MB).`
      });
    case "BodyTooLarge": {
      const ceiling = LIMITS.maxFilesPerUpload * LIMITS.maxUploadBytes;
      return new LimitExceeded({
        limit: "maxUploadBytes",
        ceiling,
        received: receivedBytes(request, ceiling),
        message: `La subida entera supera el máximo permitido (${LIMITS.maxFilesPerUpload} ficheros de ${megabytes(LIMITS.maxUploadBytes)} MB como mucho).`
      });
    }
    case "TooManyParts":
      return new LimitExceeded({
        limit: "maxFilesPerUpload",
        ceiling: LIMITS.maxFilesPerUpload,
        received: LIMITS.maxFilesPerUpload + 1,
        message: `Se han enviado más ficheros de los permitidos (máximo ${LIMITS.maxFilesPerUpload}).`
      });
    case "FieldTooLarge":
      return new LimitExceeded({
        limit: "maxUploadBytes",
        ceiling: LIMITS.maxUploadBytes,
        received: receivedBytes(request, LIMITS.maxUploadBytes),
        message: "Uno de los campos de la subida supera el tamaño permitido."
      });
  }
};

export const MultipartLimitGuardLive = Layer.succeed(MultipartLimitGuard)(
  (handler) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      return yield* handler.pipe(
        Effect.catchDefect((defect) => {
          if (!(defect instanceof Multipart.MultipartError)) {
            return Effect.die(defect);
          }
          const reason = resolveLimitReason(defect);
          if (reason === null) {
            return Effect.die(defect);
          }
          return Effect.fail(toLimitExceeded(reason, request));
        })
      );
    })
);

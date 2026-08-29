import { Schema } from "effect";

// Errores declarados de los endpoints de artefactos (ADR-005, invariante 6: nada de orDie en
// handlers). El handler los mapea al estado HTTP que dice la tabla de la sección 4.10 del plan de la
// fase 2. `message` va ya redactado en español, para la interfaz.

export class ArtifactNotFound extends Schema.ErrorClass<ArtifactNotFound>("ArtifactNotFound")({
  _tag: Schema.tag("ArtifactNotFound"),
  artifactId: Schema.String,
  message: Schema.String
}) {}

// El artefacto existe pero no es del tipo que la operación necesita (p. ej. guardar un apunte sobre
// un quiz).
export class ArtifactTypeMismatch extends Schema.ErrorClass<ArtifactTypeMismatch>("ArtifactTypeMismatch")({
  _tag: Schema.tag("ArtifactTypeMismatch"),
  artifactId: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
  message: Schema.String
}) {}

// Un techo de `limits.ts` cruzado al guardar un apunte: bloques, caracteres por bloque o título.
// `blockId` no nulo señala el bloque concreto que se pasó (F2-04).
export class NoteLimitExceeded extends Schema.ErrorClass<NoteLimitExceeded>("NoteLimitExceeded")({
  _tag: Schema.tag("NoteLimitExceeded"),
  limit: Schema.String,
  ceiling: Schema.Number,
  received: Schema.Number,
  blockId: Schema.NullOr(Schema.String),
  message: Schema.String
}) {}

// El guardado trae un bloque con `id` que no está en el apunte guardado. No se inventa uno nuevo:
// casar contra la clave equivocada produce un apunte bien formado y falso.
export class UnknownBlock extends Schema.ErrorClass<UnknownBlock>("UnknownBlock")({
  _tag: Schema.tag("UnknownBlock"),
  blockId: Schema.String,
  message: Schema.String
}) {}

// La operación (reescritura, propuesta) apunta a un bloque que el apunte no tiene.
export class BlockNotFound extends Schema.ErrorClass<BlockNotFound>("BlockNotFound")({
  _tag: Schema.tag("BlockNotFound"),
  blockId: Schema.String,
  message: Schema.String
}) {}

export class ProposalNotFound extends Schema.ErrorClass<ProposalNotFound>("ProposalNotFound")({
  _tag: Schema.tag("ProposalNotFound"),
  proposalId: Schema.String,
  message: Schema.String
}) {}

// El bloque afectado por una propuesta cambió desde que el tutor la escribió. Se enseñan los dos
// textos: `seen` es el que vio el tutor, `current` el de ahora (F2-29).
export class ProposalStale extends Schema.ErrorClass<ProposalStale>("ProposalStale")({
  _tag: Schema.tag("ProposalStale"),
  proposalId: Schema.String,
  blockId: Schema.String,
  seen: Schema.String,
  current: Schema.String,
  message: Schema.String
}) {}

export class TooManyProposals extends Schema.ErrorClass<TooManyProposals>("TooManyProposals")({
  _tag: Schema.tag("TooManyProposals"),
  ceiling: Schema.Number,
  received: Schema.Number,
  message: Schema.String
}) {}

// La reescritura de un bloque falló: el modelo no respondió, devolvió vacío o dio timeout.
export class RewriteFailed extends Schema.ErrorClass<RewriteFailed>("RewriteFailed")({
  _tag: Schema.tag("RewriteFailed"),
  reason: Schema.String,
  message: Schema.String
}) {}

// Una URL rechazada por una de las siete guardas. `reason` nombra la guarda concreta (esquema,
// dirección privada, redirección, tipo de contenido, techo de bytes o de tiempo).
export class UrlRejected extends Schema.ErrorClass<UrlRejected>("UrlRejected")({
  _tag: Schema.tag("UrlRejected"),
  url: Schema.String,
  reason: Schema.String,
  message: Schema.String
}) {}

// La URL pasó las guardas pero la descarga falló (host caído, corte de red).
export class UrlFetchFailed extends Schema.ErrorClass<UrlFetchFailed>("UrlFetchFailed")({
  _tag: Schema.tag("UrlFetchFailed"),
  url: Schema.String,
  message: Schema.String
}) {}

// El almacenamiento de artefactos falló al leer o escribir. 500, pero con cuerpo y motivo, nunca un
// orDie mudo (invariante 6).
export class ArtifactStorageError extends Schema.ErrorClass<ArtifactStorageError>("ArtifactStorageError")({
  _tag: Schema.tag("ArtifactStorageError"),
  message: Schema.String
}) {}

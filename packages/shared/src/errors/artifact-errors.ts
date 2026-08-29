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

// El almacenamiento de artefactos falló al leer o escribir. 500, pero con cuerpo y motivo, nunca un
// orDie mudo (invariante 6).
export class ArtifactStorageError extends Schema.ErrorClass<ArtifactStorageError>("ArtifactStorageError")({
  _tag: Schema.tag("ArtifactStorageError"),
  message: Schema.String
}) {}

import { Schema } from "effect";

// Lo que está en pantalla y viaja al tutor por referencia (fase 4, decisión 5, enmienda ADR-006): se
// propone solo, se ve antes de enviar y se puede quitar (invariante 9). Solo identificadores y
// título, nunca texto libre: si no se puede pegar contenido, no se puede colar contenido.

// La superficie del material que el alumno está mirando (fase 5, §5.2). Son las cuatro pestañas de
// `MaterialTabs`, no una etiqueta nueva: el servidor las traduce al vocabulario visible `PDF`,
// `Mapa`, `Apuntes` y `Pruebas` al describirlas. Viaja DENTRO de la referencia de material para no
// gastar uno de los tres huecos de `maxContextRefs`.
export const MaterialSurface = Schema.Union([
  Schema.Literal("pdf"),
  Schema.Literal("mindmap"),
  Schema.Literal("notes"),
  Schema.Literal("assessments")
]);
export type MaterialSurface = typeof MaterialSurface.Type;

// `surface` es opcional a propósito: los turnos ya guardados en disco se decodifican con este mismo
// schema (`file-session-repository.ts`), y un turno escrito antes de fase 5 no lo tiene. Sin
// opcional, una conversación antigua dejaría de leerse entera. La interfaz de hoy siempre lo manda;
// cuando falta, el servidor describe el material sin afirmar en qué pestaña estaba (invariante 3: no
// se rellena con un valor plausible).
export const MaterialContextRef = Schema.Struct({
  type: Schema.Literal("material"),
  materialId: Schema.String,
  title: Schema.String,
  surface: Schema.optional(MaterialSurface)
});
export type MaterialContextRef = typeof MaterialContextRef.Type;

// El apunte abierto en `Apuntes`. Las pruebas ya no usan esta referencia genérica: tienen la suya
// (`AssessmentContextRef`), que sí declara qué vista se está mirando.
export const ArtifactContextRef = Schema.Struct({
  type: Schema.Literal("artifact"),
  artifactId: Schema.String,
  title: Schema.String
});
export type ArtifactContextRef = typeof ArtifactContextRef.Type;

// La prueba abierta en `Pruebas` (fase 5, §5.2). El cliente no manda `kind`, `mode` ni `scope`: el
// servidor carga el artefacto por id y deriva de datos reales si es un Control o un Examen. `view`
// describe únicamente la vista de interfaz, que el servidor no puede deducir del artefacto.
export const AssessmentContextRef = Schema.Struct({
  type: Schema.Literal("assessment"),
  artifactId: Schema.String,
  title: Schema.String,
  view: Schema.Union([Schema.Literal("solve"), Schema.Literal("history")])
});
export type AssessmentContextRef = typeof AssessmentContextRef.Type;

export const BlockContextRef = Schema.Struct({
  type: Schema.Literal("block"),
  artifactId: Schema.String,
  blockId: Schema.String,
  title: Schema.String
});
export type BlockContextRef = typeof BlockContextRef.Type;

// La página que el alumno adjunta desde el PDF con `Preguntar a Sym` (fase 5, §5.2, F5-40). Lleva el
// número, nunca el texto de la página: el tutor la lee con un comando si la necesita. El servidor
// valida que exista dentro del rango del material.
export const PageContextRef = Schema.Struct({
  type: Schema.Literal("page"),
  materialId: Schema.String,
  page: Schema.Number,
  title: Schema.String
});
export type PageContextRef = typeof PageContextRef.Type;

export const ChatContextRef = Schema.Union([
  MaterialContextRef,
  ArtifactContextRef,
  AssessmentContextRef,
  BlockContextRef,
  PageContextRef
]);
export type ChatContextRef = typeof ChatContextRef.Type;

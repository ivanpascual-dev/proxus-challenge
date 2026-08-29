import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import { Artifact as SharedArtifact } from "@proxus/shared";
import { Artifact as ServerArtifact } from "./artifact.ts";

// El esquema de artefactos está duplicado entre `shared` y `server/domain/artifacts` palabra por
// palabra (architecture.md:288). El servidor decodifica el fichero de disco con SU copia y lo sirve
// con la de `shared`: si una se cambia sin la otra, el typecheck no avisa. Este test decodifica el
// mismo apunte con las dos y comprueba que coinciden (riesgo 1 del plan de la fase 2).
const noteJson = JSON.stringify({
  kind: "note",
  id: "note-1",
  title: "Conjuntos",
  materialId: "conjuntos",
  blocks: [
    {
      id: "b1",
      markdown: "Un set es una colección bien definida de elementos.",
      author: "tutor",
      emphasis: false,
      source: {
        type: "material",
        materialId: "conjuntos",
        pages: [3],
        excerpt: "…",
        excerptTruncated: false,
        transcribed: true,
        unanchoredReason: null
      }
    },
    {
      id: "b2",
      markdown: "Nota mía sobre el conjunto vacío.",
      author: "student",
      emphasis: true,
      source: null
    }
  ],
  proposals: [
    {
      id: "p1",
      createdAt: "2026-08-29T00:00:00.000Z",
      rationale: "Falta el caso del conjunto vacío",
      operation: { type: "remove", blockId: "b2", baseMarkdown: "Nota mía sobre el conjunto vacío." }
    }
  ]
});

test("un apunte guardado se decodifica igual con el esquema de shared y el del servidor", () => {
  const fromShared = Schema.decodeUnknownSync(Schema.fromJsonString(SharedArtifact))(noteJson);
  const fromServer = Schema.decodeUnknownSync(Schema.fromJsonString(ServerArtifact))(noteJson);
  assert.deepEqual(fromServer, fromShared);
});

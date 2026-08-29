import assert from "node:assert/strict";
import { test } from "node:test";
import type { Artifact, NoteArtifact } from "../../artifacts/artifact.ts";
import { renderArtifactListing, renderNoteBlocks, renderNoteOutline } from "./artifact-commands.ts";

const note: Artifact = {
  kind: "note",
  id: "note-1",
  title: "Psicología social",
  materialId: "mat-42",
  blocks: [],
  proposals: []
};

const quiz: Artifact = {
  kind: "quiz",
  id: "quiz-1",
  title: "Repaso",
  questions: []
};

test("renderArtifactListing: la línea del apunte lleva su materialId; el quiz no", () => {
  const out = renderArtifactListing({ artifacts: [note, quiz], unreadable: [] });
  assert.equal(
    out,
    "- note-1: Psicología social (note), material mat-42\n- quiz-1: Repaso (quiz)"
  );
});

test("renderArtifactListing: sin artefactos lo dice, y lista los ilegibles con su motivo", () => {
  const out = renderArtifactListing({
    artifacts: [],
    unreadable: [{ fileName: "roto.json", reason: "no tiene el formato de un artefacto válido" }]
  });
  assert.equal(
    out,
    "No artifacts found.\n\nUnreadable files (1): roto.json (no tiene el formato de un artefacto válido)"
  );
});

const noteWithBlocks: NoteArtifact = {
  kind: "note",
  id: "n1",
  title: "Psicología social T1",
  materialId: "mat-1",
  blocks: [
    {
      id: "b-mat",
      markdown: "## La influencia de los demás\n\nTexto largo del bloque...",
      author: "tutor",
      emphasis: true,
      source: {
        type: "material",
        materialId: "mat-1",
        pages: [2, 3],
        excerpt: "fragmento cacheado que no debe salir",
        excerptTruncated: false,
        transcribed: false,
        unanchoredReason: null
      }
    },
    {
      id: "b-url",
      markdown: "Un párrafo sin encabezado traído de la web.",
      author: "student",
      emphasis: false,
      source: {
        type: "url",
        url: "https://psicologiaymente.com/social/psicologia-social",
        fetchedAt: "2026-08-29T00:00:00.000Z",
        title: "¿Qué es la Psicología Social?",
        excerpt: "recibo verificable",
        excerptTruncated: false
      }
    }
  ],
  proposals: [
    {
      id: "p1",
      createdAt: "2026-08-29T00:00:00.000Z",
      rationale: "Falta el caso del conjunto vacío",
      operation: { type: "remove", blockId: "b-url", baseMarkdown: "Un párrafo sin encabezado traído de la web." }
    }
  ]
};

test("renderNoteOutline: una línea por bloque con encabezado, fuente y tamaño, sin el texto ni el excerpt", () => {
  const out = renderNoteOutline(noteWithBlocks);
  assert.match(out, /^note n1: "Psicología social T1" \(material: mat-1\)\n2 blocks, 1 pending proposals/);
  assert.match(out, /- b-mat {2}La influencia de los demás {2}\[tutor, emphasis\] {2}material p\.2,3 {2}· \d+ chars/);
  assert.match(out, /- b-url {2}Un párrafo sin encabezado traído de la web\. {2}\[student\] {2}url psicologiaymente\.com {2}· \d+ chars/);
  assert.match(out, /Pending proposals:\n- p1 {2}remove {2}"Falta el caso del conjunto vacío"/);
  assert.match(out, /artifacts block n1 <blockId>/);
  assert.doesNotMatch(out, /Texto largo del bloque/);
  assert.doesNotMatch(out, /fragmento cacheado/);
});

test("renderNoteBlocks: devuelve el markdown completo de los ids pedidos, sin excerpt, y nombra los que no están", () => {
  const out = renderNoteBlocks(noteWithBlocks, ["b-mat", "b-ausente"]);
  assert.match(out, /## La influencia de los demás\\n\\nTexto largo del bloque/);
  assert.doesNotMatch(out, /fragmento cacheado/);
  assert.match(out, /Not in note n1: b-ausente/);
});

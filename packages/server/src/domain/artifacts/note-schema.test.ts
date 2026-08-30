import assert from "node:assert/strict";
import { test } from "node:test";
import { Schema } from "effect";
import {
  Artifact as SharedArtifact,
  ArtifactAttempt as SharedArtifactAttempt
} from "@proxus/shared";
import {
  Artifact as ServerArtifact,
  ArtifactAttempt as ServerArtifactAttempt
} from "./artifact.ts";

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

// El mismo riesgo del mirror alcanza a las pruebas y a los intentos: la fase 3 toca doce esquemas
// (riesgo 6 del plan). Un campo añadido en un solo lado pasa el typecheck y revienta en ejecución.
const source = {
  materialId: "conjuntos",
  topicId: "cardinalidad",
  pages: [3, 4],
  transcribed: false,
  unanchoredReason: null
};

const quizJson = JSON.stringify({
  kind: "quiz",
  id: "quiz-1",
  title: "Control de cardinalidad",
  scope: { materialId: "conjuntos", topicId: "cardinalidad", topicLabel: "Cardinalidad" },
  origin: "material",
  createdAt: "2026-08-30T10:00:00.000Z",
  examTimeLimitSeconds: 780,
  questions: [
    {
      type: "multiple-choice",
      id: "q1",
      prompt: "¿Cuántos elementos tiene el conjunto vacío?",
      options: [
        { id: "a", text: "0" },
        { id: "b", text: "1" },
        { id: "c", text: "infinitos" },
        { id: "d", text: "no está definido" }
      ],
      correctOptionId: "a",
      explanation: "El conjunto vacío no tiene elementos.",
      hint: "Piensa en su definición.",
      source
    },
    {
      type: "short-answer",
      id: "q2",
      prompt: "Define la cardinalidad de un conjunto.",
      expectedAnswer: "El número de elementos que contiene.",
      maxScore: 3,
      hint: null,
      rubric: [{ id: "c1", text: "menciona el número de elementos" }],
      source
    }
  ]
});

const testJson = JSON.stringify({
  kind: "test",
  id: "test-1",
  title: "Examen de conjuntos",
  scope: { materialId: "conjuntos", topicId: null, topicLabel: "Conjuntos" },
  origin: "review",
  createdAt: "2026-08-30T11:00:00.000Z",
  examTimeLimitSeconds: 1500,
  mode: "exam",
  questions: [
    {
      type: "multiple-response",
      id: "q1",
      prompt: "¿Cuáles son operaciones entre conjuntos?",
      options: [
        { id: "a", text: "unión" },
        { id: "b", text: "derivada" },
        { id: "c", text: "intersección" },
        { id: "d", text: "límite" }
      ],
      correctOptionIds: ["a", "c"],
      explanation: "Unión e intersección son operaciones entre conjuntos.",
      hint: null,
      source
    },
    {
      type: "true-false",
      id: "q2",
      prompt: "El conjunto vacío es subconjunto de todo conjunto.",
      correctAnswer: true,
      explanation: "Por vacuidad.",
      hint: null,
      source
    }
  ]
});

const attemptJson = JSON.stringify({
  status: "graded",
  id: "attempt-1",
  artifactId: "quiz-1",
  artifactKind: "quiz",
  mode: "practice",
  startedAt: "2026-08-30T10:05:00.000Z",
  timeLimitSeconds: null,
  hintsRevealed: ["q1"],
  answers: [
    { questionType: "multiple-choice", questionId: "q1", selectedOptionId: "a" },
    { questionType: "short-answer", questionId: "q2", answer: "el número de elementos" }
  ],
  connectedSeconds: 240,
  lastHeartbeatAt: "2026-08-30T10:09:00.000Z",
  interruptions: [],
  submittedAt: "2026-08-30T10:09:00.000Z",
  elapsedSeconds: 240,
  corrections: [
    {
      questionType: "multiple-choice",
      questionId: "q1",
      correct: true,
      selectedOptionId: "a",
      correctOptionId: "a",
      explanation: "El conjunto vacío no tiene elementos."
    },
    {
      questionType: "short-answer",
      questionId: "q2",
      status: "graded",
      score: 3,
      maxScore: 3,
      criteria: [{ id: "c1", text: "menciona el número de elementos", met: true }],
      unevaluatedReason: null,
      feedback: "Correcto."
    }
  ],
  rawScore: 4,
  maxScore: 4,
  penalty: 0,
  displayedScore: 10,
  summary: "4/4"
});

test("una prueba y un intento guardados se decodifican igual con shared y con el servidor", () => {
  for (const json of [quizJson, testJson]) {
    assert.deepEqual(
      Schema.decodeUnknownSync(Schema.fromJsonString(ServerArtifact))(json),
      Schema.decodeUnknownSync(Schema.fromJsonString(SharedArtifact))(json)
    );
  }

  assert.deepEqual(
    Schema.decodeUnknownSync(Schema.fromJsonString(ServerArtifactAttempt))(attemptJson),
    Schema.decodeUnknownSync(Schema.fromJsonString(SharedArtifactAttempt))(attemptJson)
  );
});

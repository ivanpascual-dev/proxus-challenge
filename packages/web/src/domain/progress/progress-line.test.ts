import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessmentProgressLine,
  indexProgressLine,
  noteProgressLine
} from "./progress-line.ts";

// F5-45: una sola línea derivada de un evento real, con contador solo cuando el total es mayor que 1.

test("indexado, primera página: frase de lectura y contador completo", () => {
  assert.deepEqual(indexProgressLine({ page: 1, pageCount: 82 }), {
    phrase: "Leyendo el documento",
    step: 1,
    total: 82
  });
});

test("indexado, página intermedia: el contador avanza sin cambiar la frase", () => {
  assert.deepEqual(indexProgressLine({ page: 41, pageCount: 82 }), {
    phrase: "Leyendo el documento",
    step: 41,
    total: 82
  });
});

test("indexado, última página: sigue siendo lectura, no cierre", () => {
  assert.deepEqual(indexProgressLine({ page: 82, pageCount: 82 }), {
    phrase: "Leyendo el documento",
    step: 82,
    total: 82
  });
});

test("indexado, fase de temas: frase de cierre sin contador", () => {
  assert.deepEqual(indexProgressLine({ page: null, pageCount: 82 }), {
    phrase: "Ordenando los temas del material",
    step: null,
    total: null
  });
});

test("indexado de un PDF de una página: no dice «página 1 de 1»", () => {
  assert.deepEqual(indexProgressLine({ page: 1, pageCount: 1 }), {
    phrase: "Leyendo el documento",
    step: null,
    total: null
  });
});

test("total 0: no se inventa una fracción", () => {
  assert.deepEqual(indexProgressLine({ page: 1, pageCount: 0 }), {
    phrase: "Leyendo el documento",
    step: null,
    total: null
  });
});

test("apuntes, tema intermedio: frase de redacción con contador", () => {
  assert.deepEqual(noteProgressLine({ topic: 3, topicCount: 7 }), {
    phrase: "Redactando los apuntes",
    step: 3,
    total: 7
  });
});

test("apuntes, fase de guardado: frase de cierre sin contador", () => {
  assert.deepEqual(noteProgressLine({ topic: null, topicCount: 7 }), {
    phrase: "Guardando los apuntes",
    step: null,
    total: null
  });
});

test("apuntes de un único tema: sin contador", () => {
  assert.deepEqual(noteProgressLine({ topic: 1, topicCount: 1 }), {
    phrase: "Redactando los apuntes",
    step: null,
    total: null
  });
});

test("prueba, tema intermedio: frase de escritura con contador", () => {
  assert.deepEqual(assessmentProgressLine({ topic: 2, topicCount: 5 }), {
    phrase: "Escribiendo las preguntas",
    step: 2,
    total: 5
  });
});

test("prueba, fase de guardado: frase de cierre sin contador", () => {
  assert.deepEqual(assessmentProgressLine({ topic: null, topicCount: 5 }), {
    phrase: "Guardando la prueba",
    step: null,
    total: null
  });
});

test("Control de un solo tema: sin contador", () => {
  assert.deepEqual(assessmentProgressLine({ topic: 1, topicCount: 1 }), {
    phrase: "Escribiendo las preguntas",
    step: null,
    total: null
  });
});

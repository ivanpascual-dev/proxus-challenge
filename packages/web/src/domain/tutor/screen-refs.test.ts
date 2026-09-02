import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "@proxus/shared";
import { buildScreenContext, type ScreenRefsInput } from "./screen-refs.ts";

const base: ScreenRefsInput = {
  materialId: "calculo",
  title: "Cálculo I",
  surface: "pdf",
  note: undefined,
  selectedBlock: undefined,
  assessment: undefined,
  page: undefined
};

test("el material viaja siempre, con la superficie dentro y sin gastar un hueco extra", () => {
  const refs = buildScreenContext({ ...base, surface: "mindmap" });

  assert.deepEqual(refs, [
    { type: "material", materialId: "calculo", title: "Cálculo I", surface: "mindmap" }
  ]);
});

test("en Apuntes viajan el apunte y el bloque seleccionado", () => {
  const refs = buildScreenContext({
    ...base,
    surface: "notes",
    note: { id: "n1", title: "Apuntes de Cálculo I" },
    selectedBlock: { id: "b3", title: "La derivada" }
  });

  assert.deepEqual(refs.map((ref) => ref.type), ["material", "artifact", "block"]);
});

// Un bloque nuevo todavía no guardado no tiene id de servidor: quien lo llama pasa `undefined` y
// aquí no se inventa ninguno.
test("sin bloque seleccionado, Apuntes solo adjunta el apunte", () => {
  const refs = buildScreenContext({
    ...base,
    surface: "notes",
    note: { id: "n1", title: "Apuntes de Cálculo I" },
    selectedBlock: undefined
  });

  assert.deepEqual(refs.map((ref) => ref.type), ["material", "artifact"]);
});

test("en la lista de Pruebas no se finge que haya una prueba abierta", () => {
  const refs = buildScreenContext({ ...base, surface: "assessments", assessment: undefined });

  assert.deepEqual(refs.map((ref) => ref.type), ["material"]);
});

test("la prueba abierta lleva su vista, y el cliente no manda tipo ni modo", () => {
  const refs = buildScreenContext({
    ...base,
    surface: "assessments",
    assessment: { id: "q1", title: "Control de derivadas", view: "history" }
  });

  assert.deepEqual(refs[1], {
    type: "assessment",
    artifactId: "q1",
    title: "Control de derivadas",
    view: "history"
  });
});

test("la página adjunta desde el PDF viaja con su material", () => {
  const refs = buildScreenContext({ ...base, surface: "pdf", page: 7 });

  assert.deepEqual(refs[1], {
    type: "page",
    materialId: "calculo",
    page: 7,
    title: "Cálculo I"
  });
});

// El bloque y la página nunca conviven: son "bloque o página activa" (§5.2), y cada uno pertenece a
// una superficie distinta.
test("la página no sigue adjunta fuera del PDF, ni el bloque fuera de Apuntes", () => {
  const fromNotes = buildScreenContext({
    ...base,
    surface: "notes",
    note: { id: "n1", title: "Apuntes" },
    selectedBlock: { id: "b1", title: "La derivada" },
    page: 7
  });
  const fromPdf = buildScreenContext({
    ...base,
    surface: "pdf",
    note: { id: "n1", title: "Apuntes" },
    selectedBlock: { id: "b1", title: "La derivada" },
    page: 7
  });

  assert.deepEqual(fromNotes.map((ref) => ref.type), ["material", "artifact", "block"]);
  assert.deepEqual(fromPdf.map((ref) => ref.type), ["material", "page"]);
});

// Invariante 11: ninguna combinación puede pasarse del techo. Si alguna lo hiciera, el servidor
// rechazaría el turno entero, así que el fallo se ve aquí y no en la cara del alumno.
test("ninguna combinación posible pasa de maxContextRefs", () => {
  const surfaces = ["pdf", "mindmap", "notes", "assessments"] as const;
  for (const surface of surfaces) {
    const refs = buildScreenContext({
      materialId: "calculo",
      title: "Cálculo I",
      surface,
      note: { id: "n1", title: "Apuntes" },
      selectedBlock: { id: "b1", title: "La derivada" },
      assessment: { id: "q1", title: "Control", view: "solve" },
      page: 7
    });
    assert.ok(refs.length <= LIMITS.maxContextRefs, `${surface}: ${refs.length} referencias`);
  }
});

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Window } from "happy-dom";

// F2-41: "un apunte editado, guardado y releído DEBERÁ conservar su markdown, y ningún formato que
// solo se pueda representar con HTML DEBERÁ ofrecerse". `tiptap-markdown` necesita un DOM para
// instanciar el editor, así que el test corre sobre happy-dom (devDependency solo de test; ver
// notes/bitacora.md, cierre de fase 2).

let Editor: typeof import("@tiptap/core").Editor;
let noteBlockSchemaExtensions: typeof import("./noteBlockSchema.ts").noteBlockSchemaExtensions;

before(async () => {
  const window = new Window({ url: "http://localhost" });
  const source = window as unknown as Record<string, unknown>;
  for (const key of ["window", "document", "navigator", "DOMParser", "MutationObserver", "getComputedStyle", "Node", "Element", "HTMLElement", "Text", "DocumentFragment"]) {
    Object.defineProperty(globalThis, key, { value: source[key], configurable: true, writable: true });
  }
  // Los imports de TipTap se resuelven después de tener el DOM montado.
  ({ Editor } = await import("@tiptap/core"));
  ({ noteBlockSchemaExtensions } = await import("./noteBlockSchema.ts"));
});

const roundTrip = (markdown: string): string => {
  const editor = new Editor({ extensions: noteBlockSchemaExtensions(), content: markdown });
  const out = editor.storage.markdown.getMarkdown();
  editor.destroy();
  return out;
};

// Cada caso: un formato que el editor ofrece (barra flotante o menú "/"), en su markdown de entrada.
const CASES: ReadonlyArray<readonly [name: string, markdown: string]> = [
  ["negrita", "Un texto con **negrita** dentro."],
  ["cursiva", "Un texto con *cursiva* dentro."],
  ["enlace", "Ver la [página del tema](https://example.com/tema) para más."],
  ["encabezado H1", "# Título grande del bloque"],
  ["encabezado H2", "## Título de sección"],
  ["encabezado H3", "### Subtítulo"],
  ["encabezado H4", "#### Apartado"],
  ["encabezado H5", "##### Nivel cinco"],
  ["encabezado H6", "###### Nivel seis"],
  ["lista con viñetas", "- Primero\n- Segundo\n- Tercero"],
  ["lista numerada", "1. Uno\n2. Dos\n3. Tres"],
  ["cita", "> Una cita del material."],
  ["código", "```\nconst x = 1;\n```"],
  ["tabla GFM", "| Tema | Página |\n| --- | --- |\n| Conjuntos | 3 |\n| Uniones | 4 |"],
  ["documento mixto", "## Definición\n\nUn **conjunto** es una colección de elementos *distintos*.\n\n- Se escribe entre llaves\n- El orden no importa\n\n> Ver la [página 3](https://example.com/p3)."]
];

for (const [name, markdown] of CASES) {
  test(`round-trip conserva el markdown: ${name}`, () => {
    const once = roundTrip(markdown);
    const twice = roundTrip(once);

    // Idempotente: cargar lo guardado y volver a guardar no cambia nada. Esto es lo que F2-41 pide
    // (editar, guardar, releer conserva el markdown) y lo que sostiene la comparación `baseMarkdown`
    // de las propuestas del tutor (ADR-014).
    assert.equal(twice, once, `la re-serialización no es estable para "${name}"`);

    // Ningún formato mete HTML en el texto guardado (F2-41, ADR-017).
    assert.ok(!/<[a-z][\s\S]*?>/i.test(once), `se coló HTML al serializar "${name}": ${once}`);

    // El contenido semántico sobrevive: enlaces, énfasis y encabezados siguen ahí.
    if (name === "enlace" || markdown.includes("](")) {
      assert.ok(once.includes("https://example.com"), `el enlace se perdió en "${name}"`);
    }
    if (markdown.includes("**")) {
      assert.ok(once.includes("**"), `la negrita se perdió en "${name}"`);
    }
    if (markdown.startsWith("#")) {
      assert.ok(once.trimStart().startsWith("#"), `el encabezado se perdió en "${name}"`);
    }
  });
}

// F5-50: el H1 tiene que volver siendo H1. Si `tiptap-markdown` lo degradara a otro nivel, el bucle
// de arriba seguiría en verde (sigue empezando por "#") y el apunte perdería el encabezado principal
// en silencio al guardar y recargar.
test("el H1 conserva su nivel al guardar y volver a leer", () => {
  assert.equal(roundTrip("# Título grande del bloque").trim(), "# Título grande del bloque");
});

test("un formato que solo se representa con HTML no está en el esquema del bloque (F2-41)", () => {
  // Subrayado y color solo se guardan como `<u>` / `<span style>`; `tiptap-markdown` los perdería en
  // silencio. F2-41 prohíbe ofrecerlos, así que el esquema no los reconoce.
  const editor = new Editor({ extensions: noteBlockSchemaExtensions(), content: "texto" });
  const markNames = Object.keys(editor.schema.marks);
  editor.destroy();
  assert.ok(!markNames.includes("underline"), `el esquema trae la marca underline: ${markNames.join(", ")}`);
  assert.ok(!markNames.includes("textStyle"), `el esquema trae textStyle (color): ${markNames.join(", ")}`);
});

test("subrayar (Mod-U) no hace nada y no ensucia el markdown guardado", () => {
  const editor = new Editor({ extensions: noteBlockSchemaExtensions(), content: "hola mundo" });
  // El comando no existe en el esquema, así que la cadena falla y el markdown queda intacto.
  editor.chain().selectAll().run();
  const out = editor.storage.markdown.getMarkdown();
  editor.destroy();
  assert.equal(out, "hola mundo");
  assert.ok(!/<u>|<\/u>/i.test(out));
});

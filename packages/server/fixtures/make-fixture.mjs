// Genera packages/server/fixtures/materials/densidad.pdf: cuatro páginas pensadas para calibrar el
// clasificador de densidad (packages/server/src/domain/materials/page-classifier.ts).
//
// El umbral es LIMITS.textDensityThreshold (600 caracteres no blancos). Cada página tiene un número
// de caracteres no blancos elegido a propósito para caer a un lado concreto del umbral:
//
//   Página 1  ~26   -> transcribed (portada escasa)
//   Página 2  2400   -> extracted   (texto corrido)
//   Página 3  200    -> transcribed (texto escaso)
//   Página 4  610    -> extracted   (justo por encima del umbral)
//
// Sin dependencias nuevas: escribe el PDF a mano. El texto va en operadores Tj para que `pdftotext`
// lo recupere tal cual. Material sintético, generado, sin derechos de terceros.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "materials", "densidad.pdf");

// Un token de 10 caracteres no blancos. N tokens separados por espacios => N*10 caracteres no blancos.
const TOKEN = "estudiante";

const fillerLines = (nonBlankTarget) => {
  const tokenCount = Math.round(nonBlankTarget / TOKEN.length);
  const lines = [];
  for (let i = 0; i < tokenCount; i += 8) {
    lines.push(Array.from({ length: Math.min(8, tokenCount - i) }, () => TOKEN).join(" "));
  }
  return lines;
};

const pageLines = [
  ["Portada del material de prueba"],
  fillerLines(2400),
  fillerLines(200),
  fillerLines(610)
];

// --- PDF a mano ------------------------------------------------------------
// Orden de objetos, fijo y conocido de antemano:
//   1        fuente Helvetica
//   2..5     flujos de contenido de las 4 páginas
//   6..9     objetos de página
//   10       Pages
//   11       Catalog

const FONT = 1;
const CONTENT_START = 2;
const PAGE_START = 6;
const PAGES = 10;
const CATALOG = 11;

const contentStream = (lines) => {
  const body = lines
    .map((line, index) => `${index === 0 ? "" : "0 -16 Td "}(${line}) Tj`)
    .join("\n");
  return `BT /F1 12 Tf 40 780 Td\n${body}\nET`;
};

const objects = [];
objects[FONT] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

pageLines.forEach((lines, i) => {
  const stream = contentStream(lines);
  objects[CONTENT_START + i] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  objects[PAGE_START + i] =
    `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 595 842]` +
    ` /Resources << /Font << /F1 ${FONT} 0 R >> >> /Contents ${CONTENT_START + i} 0 R >>`;
});

const kids = pageLines.map((_, i) => `${PAGE_START + i} 0 R`).join(" ");
objects[PAGES] = `<< /Type /Pages /Kids [${kids}] /Count ${pageLines.length} >>`;
objects[CATALOG] = `<< /Type /Catalog /Pages ${PAGES} 0 R >>`;

let pdf = "%PDF-1.4\n";
const offsets = [];
for (let n = 1; n <= CATALOG; n++) {
  offsets[n] = Buffer.byteLength(pdf, "latin1");
  pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${CATALOG + 1}\n0000000000 65535 f \n`;
for (let n = 1; n <= CATALOG; n++) {
  pdf += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${CATALOG + 1} /Root ${CATALOG} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(pdf, "latin1"));

console.log(`Escrito ${outputPath} (${pageLines.length} páginas)`);

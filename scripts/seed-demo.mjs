// Copia los materiales de ejemplo versionados (packages/server/fixtures/materials/*.pdf) al
// directorio de datos locales del servidor (packages/server/.data/materials/pdfs/), que está en
// .gitignore. Así se puede probar la aplicación sin apuntes propios y sin subir material de cursos.
//
// Idempotente: sobrescribe los ficheros con el mismo nombre, no borra nada más.

import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(root, "packages", "server", "fixtures", "materials");
const targetDir = join(root, "packages", "server", ".data", "materials", "pdfs");

const pdfs = readdirSync(sourceDir).filter((name) => name.toLowerCase().endsWith(".pdf"));

if (pdfs.length === 0) {
  console.error(`No hay PDFs en ${sourceDir}. Genera el fixture con: node packages/server/fixtures/make-fixture.mjs`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
for (const name of pdfs) {
  copyFileSync(join(sourceDir, name), join(targetDir, name));
  console.log(`copiado ${name}`);
}
console.log(`\n${pdfs.length} material(es) de ejemplo en ${targetDir}`);

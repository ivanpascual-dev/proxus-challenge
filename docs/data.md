# Datos locales

El server usa storage local bajo `packages/server/.data`. Esa carpeta está ignorada por git y no debe subirse a la repo.

## Layout esperado

```txt
packages/server/.data/
  agent-sessions/
    <sessionId>.json
  artifacts/
    artifacts/
      <artifactId>.json
    attempts/
      <attemptId>.json
  materials/
    pdfs/
      *.pdf
    index/
      <sha256>.json
    pages/
      <sha256>-<page>.png
  profile/
    <materialId>.json
```

El índice se archiva por huella del contenido (`sha256`), no por `materialId` (ADR-011): dos PDFs con
el mismo contenido y distinto nombre comparten fichero de índice, y uno editado deja su índice viejo
huérfano en disco a propósito (vuelve a servir si se deshace la edición).

`materials/pages` cachea el render de cada página (`FileMaterialRepository.renderPage`), también por
huella del contenido: `<sha256>-<page>.png`. Se comparte entre dos PDFs de bytes idénticos igual que el
índice.

`profile/<materialId>.json` es el perfil de estudio (ADR-002), por `materialId`, no por huella: no se
comparte entre materiales.

**Ciclo de vida al borrar un material (ADR-027).** El perfil se borra siempre, por `materialId`. El
índice y las páginas cacheadas por huella se borran solo cuando el PDF borrado era la **última**
referencia viva a esa huella: si otro PDF con nombre distinto conserva los mismos bytes, su índice y sus
páginas se quedan. El PDF se borra el último de la cascada (intentos, artefactos, perfil, derivados por
huella, PDF), para que un fallo a mitad deje el material recuperable en vez de a medio borrar.

## Materials

Los PDFs viven en:

```txt
packages/server/.data/materials/pdfs/
```

El repo espera que Poppler esté instalado para inspeccionar/renderizar/extraer texto de PDFs:

- `pdfinfo`
- `pdftoppm`
- `pdftotext`

El tutor puede usar:

```txt
materials list
materials read <materialId> <pages>
materials view <materialId> <pages>
```

`materials read` devuelve el texto ya indexado, la primera opción por ser la más barata; `materials
view` renderiza páginas como imágenes para Gemini multimodal, para cuando el texto no basta.

## Artifacts

Los artifacts creados por el tutor o por comandos se guardan como JSON.

Kinds:

- `note`
- `quiz`
- `test`

Attempts:

- `ungraded`
- `graded`

Las correcciones viven dentro del attempt; no hay entidad `Review` separada.

## Reset local

Para limpiar datos generados, para el server y borra selectivamente:

```bash
rm -rf packages/server/.data/artifacts
rm -rf packages/server/.data/agent-sessions
```

No borres `materials/pdfs` si quieres conservar PDFs de prueba.

## Fixtures de ejemplo

Los dos son **sintéticos, generados y sin derechos de terceros**, y los escribe a mano un script sin
dependencias nuevas. Sirven para cosas distintas y no se sustituyen entre sí.

**`densidad.pdf` es material de calibración, no de demostración.** Lo genera
`packages/server/fixtures/make-fixture.mjs`. Son cuatro páginas con densidades de texto elegidas a
propósito (26, 2.400, 200 y 610 caracteres no blancos) para caer a los dos lados del umbral de 600:
las páginas 2 y 4 quedan por encima (`extracted`), la 1 y la 3 por debajo (`transcribed`).
`densidad-fixture.test.ts` afirma esa clasificación página a página, así que **cambiarle el contenido
rompe el test**. Su texto es una palabra repetida: no da para un mapa mental ni para una prueba.

**`enjambres-de-inspeccion.pdf` es el material de demostración.** Lo genera
`packages/server/fixtures/make-demo-fixture.mjs`. Son seis páginas de un manual inventado de cabo a
rabo (una disciplina que no existe, con sus definiciones, sus clasificaciones, sus umbrales
numéricos y sus protocolos), pensado para que se pueda recorrer la aplicación entera sin subir un PDF
con derechos: todas sus páginas pasan el umbral de densidad, así que se indexa por texto sin coste de
renderizado ni de visión, y produce **nueve temas** en el mapa mental con material suficiente para
apuntes, Controles y Exámenes.

**`inyeccion.pdf` es munición de la batería de guardarraíles.** Lo genera
`packages/server/fixtures/make-injection-fixture.mjs`. Son dos páginas de material de estudio
inventado con una orden de inyección metida dentro, en densidades opuestas (1.435 y 212 caracteres no
blancos) para que la orden llegue al modelo una vez por texto extraído y otra por visión, más un
canario que delata la obediencia. Es el fixture de B9; cómo correrlo está en
[`docs/testing.md`](testing.md).

```bash
pnpm run fixture:materials   # regenera densidad.pdf (calibración)
pnpm run fixture:demo        # regenera enjambres-de-inspeccion.pdf (demostración)
pnpm run fixture:inyeccion   # regenera inyeccion.pdf (guardarraíles, B9)
pnpm run seed:demo           # copia fixtures/materials/*.pdf a .data/materials/pdfs/
```

Ojo con `seed:demo`: copia **todos** los fixtures, `inyeccion.pdf` incluido, y ese ocupa plaza de
material sin ser material de estudio. Bórralo de `.data/materials/pdfs/` cuando acabes con B9.

Los 9 PDFs de `packages/server/.data/materials/pdfs` en un clon local son material de cursos reales y
**no se suben nunca**. El fixture existe para que los tests del umbral corran en cualquier clon.

## Añadir contenidos para empezar

No hay seed data commiteada dentro de `.data`. Para probar el flujo con tus propios materiales locales:

```bash
mkdir -p packages/server/.data/materials/pdfs
cp /ruta/a/un-pdf-publico-o-sintetico.pdf packages/server/.data/materials/pdfs/
```

Después arranca el server y pide al tutor:

```bash
pnpm --filter @proxus/server run agent:tutor "list my uploaded materials"
pnpm --filter @proxus/server run agent:tutor "¿de qué tratan mis materiales?"
```

Usa PDFs públicos, sintéticos o propios. No uses apuntes privados, exámenes no autorizados, datos de estudiantes ni documentación propietaria en una PR.

## Estrategia recomendada si quieres aportar datos demo

No commitees `packages/server/.data`. Si una mejora necesita contenido de ejemplo:

1. Añade un fixture público o sintético fuera de `.data`, como el `densidad.pdf` de la
   sección "Fixture de ejemplo": lo genera un script y no tiene derechos de terceros.
2. Añade el comando que lo genera y lo copia a `.data` (hoy `pnpm run fixture:materials`
   y `pnpm run seed:demo`).
3. Documenta el origen y la licencia del material demo.

## Semillas

No dependas de datos locales no versionados para una feature crítica. Si tu cambio requiere datos de ejemplo, documenta cómo crearlos o añade un script pequeño que los genere sin secretos.

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
```

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
materials view <materialId> <pages>
```

`materials view` renderiza páginas como imágenes para Gemini multimodal.

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

## Fixture de ejemplo

`packages/server/fixtures/materials/densidad.pdf` es un fixture **sintético, generado y sin derechos
de terceros**. Lo escribe a mano `packages/server/fixtures/make-fixture.mjs` (sin dependencias
nuevas). Son cuatro páginas con densidades de texto distintas (26, 2.400, 200 y 610 caracteres no
blancos) para calibrar el clasificador de densidad: las páginas 2 y 4 quedan por encima del umbral de
600 (`extracted`), la 1 y la 3 por debajo (`transcribed`).

```bash
pnpm run fixture:materials   # regenera densidad.pdf
pnpm run seed:demo           # copia fixtures/materials/*.pdf a .data/materials/pdfs/
```

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
pnpm --filter @proxus/server run agent:tutor "Crea un quiz corto usando los materiales disponibles"
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

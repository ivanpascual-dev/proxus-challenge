# API

La API principal se define en `packages/shared/src/api/*` con Effect HTTP API.

En local:

- Docs interactivas: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Endpoints

### Tutor

```http
POST /api/tutor/chat
POST /api/tutor/chat/stream
```

`/stream` devuelve NDJSON:

```json
{ "type": "message", "message": {} }
{ "type": "done" }
```

La ruta streaming está implementada manualmente para soportar eventos incrementales.

### Materials

```http
GET /api/materials/
GET /api/materials/:id
POST /api/materials/:id/index
POST /api/materials/:id/notes
```

Los materiales representan PDFs disponibles para el tutor. El server puede renderizar páginas vía Poppler para que Gemini las procese como imágenes.

`POST /:id/index` y `POST /:id/notes` devuelven NDJSON con el progreso. `/notes` genera los apuntes del
material (un bloque por tema del índice, prosa redactada por el modelo) como un servicio del dominio
con ruta, igual que la indexación y sin pasar por el tutor (ADR-016). Emite el progreso tema a tema y
termina con `done` (el resumen del apunte) o `failed` (el motivo).

### Artifacts

```http
GET /api/artifacts/
GET /api/artifacts/:id
POST /api/artifacts/:id/submit
PUT /api/artifacts/:id/note
POST /api/artifacts/:id/blocks/:blockId/rewrite
POST /api/artifacts/url-source
POST /api/artifacts/:id/proposals/:proposalId/accept
POST /api/artifacts/:id/proposals/:proposalId/reject
DELETE /api/artifacts/:id
```

`submit` crea y corrige un intento, devolviendo un attempt con estado `graded` cuando aplica.

`POST /:id/blocks/:blockId/rewrite` (`{mode: "clearer" | "deeper"}` → `{markdown, usedSource}`)
reescribe un bloque con una llamada al modelo: solo el texto del bloque y su fragmento cacheado, sin
releer el PDF. No guarda nada, devuelve la propuesta para que el alumno la acepte o la descarte. No es
un comando del tutor (ADR-016): es un botón sobre un bloque. Cuenta contra el cubo de mensajes
(`RateLimited` 429).

`POST /url-source` (`{url}` → `{source, draft}`) trae una URL para usarla como fuente de un bloque
nuevo. El servidor aplica las siete guardas del ADR-015 (solo `https`, sin IP privada tras resolver el
DNS, sin seguir redirecciones, `text/html` o `text/plain`, techo de bytes y de tiempo) y devuelve
`source`, el `UrlBlockSource` con el fragmento crudo extraído (el recibo, invariante 8), más `draft`,
un borrador del cuerpo del bloque que redacta el modelo a partir de ese fragmento. `draft` es `null`
si la página trae poco texto o la redacción falla: el bloque se añade igual, vacío. `UrlRejected` 400
nombra la guarda que falló.

`POST /:id/proposals/:proposalId/accept` aplica una propuesta del tutor (añadir, reescribir o borrar un
bloque) y la retira de las pendientes. Si el bloque afectado cambió desde que el tutor lo vio,
`ProposalStale` 409 devuelve los dos textos y no aplica nada. `POST /:id/proposals/:proposalId/reject`
retira la propuesta sin aplicarla. No hay endpoint ni comando del tutor para aceptar: solo el alumno,
desde la pestaña "Apuntes" (invariante: el tutor propone, nunca aplica).

`DELETE /:id` borra un artefacto (204). Sirve para rehacer los apuntes de un material: hay como mucho
un apunte por material, así que regenerar exige borrar el que hay.

`PUT /:id/note` guarda el apunte entero: editar, añadir, reordenar, borrar y marcar un bloque son la
misma operación y gana el último que guarda. El servidor genera el `id` de los bloques nuevos y
rellena el fragmento cacheado de cada fuente; el cliente nunca lo manda.

Ningún handler del grupo `artifacts` usa `Effect.orDie`: cada error va declarado en
`packages/shared/src/errors/artifact-errors.ts` y mapeado a su estado HTTP (404, 409, 400 o 500 con
cuerpo y motivo). `GET /` devuelve también `unreadable`, la lista de ficheros de artefacto que no se
pudieron decodificar, cada uno con su motivo, en vez de fallar entero.

## Tipos de artifact

- `note`: atado a un material (`materialId`), uno por material. Lista ordenada de bloques, cada uno con
  autoría (`tutor` o `student`), marca de énfasis y fuente opcional (un material con sus páginas o una
  URL). Lleva además las propuestas del tutor pendientes de que el alumno las acepte o descarte. Lo
  genera `POST /api/materials/:id/notes`, no `artifacts create` (el tutor solo crea quiz y test).
- `quiz`: preguntas cerradas.
- `test`: preguntas cerradas o `short-answer`.

Tipos de pregunta:

- `multiple-choice`
- `true-false`
- `short-answer` solo para tests.

Formato correcto para multiple choice:

```json
{
  "type": "multiple-choice",
  "options": [
    { "id": "a", "text": "Respuesta A" },
    { "id": "b", "text": "Respuesta B" }
  ]
}
```

El CLI tolera options como strings y las normaliza, pero el contrato estable usa `{ id, text }`.

## Cliente web

- Cliente API: `packages/web/src/api/client.ts`
- Runtime Effect: `packages/web/src/lib/runtime.ts`
- Streaming tutor: `packages/web/src/domain/tutor/stream.ts`

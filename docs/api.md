# API

La API principal se define en `packages/shared/src/api/*` con Effect HTTP API.

En local:

- Docs interactivas: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

## Endpoints

### Tutor

```http
POST   /api/tutor/chat
POST   /api/tutor/chat/stream
GET    /api/tutor/conversations
POST   /api/tutor/conversations
GET    /api/tutor/conversations/:id
DELETE /api/tutor/conversations/:id
```

La sesión vive en el servidor (fase 4, decisión 6): `POST /chat` y `/chat/stream` llevan
`conversationId`, el turno nuevo (`input`) y el contexto de pantalla (`context`, un array de
`ChatContextRef`), nunca el historial completo. Un alumno puede tener varias conversaciones, con un
techo (`LIMITS.maxConversations`, 50); `POST /conversations` crea una vacía, `GET /conversations` las
lista sin su historial (para la barra lateral), `GET /conversations/:id` trae una con sus turnos.

El `context` se comprueba contra los repositorios antes de llegar al modelo (ADR-032): una referencia
que nombre un material que no existe, una página fuera de rango, una prueba que no lo es o un bloque
borrado se rechaza con `InvalidScreenContext` (400) en `/chat`, y como evento `error` en `/stream`.

`/stream` devuelve NDJSON (`TutorChatStreamEvent`, `packages/shared/src/api/tutor.ts`):

```json
{ "type": "message", "message": {} }
{ "type": "follow-up", "questions": ["...", "...", "..."] }
{ "type": "usage", "usage": {} }
{ "type": "warning", "message": "..." }
{ "type": "error", "message": "..." }
{ "type": "done" }
```

`follow-up` trae las tres preguntas de seguimiento ya recortadas del texto (decisión 8); `usage` es el
coste del paso tal como llega del modelo, sin inventar un cero cuando falta (invariante 3); `warning`
avisa al 75% de `maxConversationHistoryTokens` sin cortar el turno; `error` es el fallo del modelo tal
cual, no disfrazado de respuesta (decisión 7).

La ruta streaming está implementada manualmente para soportar eventos incrementales.

### Materials

```http
GET    /api/materials/
POST   /api/materials/
POST   /api/materials/validate
GET    /api/materials/:id
DELETE /api/materials/:id
GET    /api/materials/:id/index
GET    /api/materials/:id/assessments
GET    /api/materials/:id/profile
GET    /api/materials/:id/pages/:page
POST   /api/materials/:id/index
POST   /api/materials/:id/notes
POST   /api/materials/:id/assessments
```

Los materiales representan PDFs disponibles para el tutor. El server puede renderizar páginas vía Poppler para que Gemini las procese como imágenes.

`POST /` sube hasta `maxFilesPerUpload` PDFs a la vez (multipart, `maxUploadBytes` por fichero), solo
PDF (fase 4, decisión 2); al subir, cada material se indexa y se le generan los apuntes en cadena, sin
pulsar nada más (decisión 3). El fallo de un fichero concreto (tipo, nombre duplicado) va dentro de la
respuesta, uno por fichero; solo los fallos agregados (frecuencia, número de ficheros, `maxMaterials`)
abortan la subida entera, antes de escribir nada.

`POST /validate` (cierre de fase 4) comprueba el mismo lote (multipart, mismo `UploadPayload`) sin
escribir nada: mismo sniff de cabecera + `pdfinfo` y misma comprobación de nombre duplicado que `POST
/`, pero en modo consulta. La interfaz la llama sola al soltar los ficheros, antes de ofrecer el botón
de subir de verdad; no comprueba `maxMaterials` (fallo agregado de `upload`) y no cuenta contra
`uploadsPerWindow` (ese techo es de subidas reales, decisión 4).

`DELETE /:id` borra el PDF y, en cascada, sus artefactos (apunte, Controles y Exámenes con sus
intentos): dejarlos huérfanos era lo que producía el choque al resubir el mismo PDF, porque el
`materialId` sale del nombre del fichero (ADR-011, ADR-024). La interfaz avisa de la pérdida antes de
llamar; el servidor no vuelve a preguntar.

`POST /:id/index` y `POST /:id/notes` devuelven NDJSON con el progreso. `/notes` genera los apuntes del
material (un bloque por tema del índice, prosa redactada por el modelo) como un servicio del dominio
con ruta, igual que la indexación y sin pasar por el tutor (ADR-016). Emite el progreso tema a tema y
termina con `done` (el resumen del apunte) o `failed` (el motivo). Si el material ya tiene un apunte
responde **409 `NoteAlreadyExists`** (con `noteId`) antes de abrir el stream: es un conflicto, no un
fallo de generación. También responde `429` si se supera la frecuencia.

`POST /:id/assessments` (`GenerateAssessmentInput` → NDJSON) genera un Control o un Examen como un
servicio del dominio con ruta, igual que la indexación y los apuntes (ADR-016, ADR-019). El cuerpo
lleva `kind` (`quiz` \| `test`), `topicId` (el tema del Control, `null` para un Examen), `origin`
(`material` \| `review`), `questionCount` (dentro del rango que fija `LIMITS`) y, para el Examen,
`mode` (`practice` \| `exam`). Las precondiciones que no necesitan el índice ni el perfil (`questionCount`
fuera de rango) o que solo necesitan el índice (material inexistente, sin indexar, techo de pruebas
alcanzado) salen como **JSON con `message` y su estado** (400, 404, 409) antes de abrir el stream, en
`precheck`; una vez abierto, emite el progreso tema a tema y termina con `done` (id de la prueba, número
de preguntas, reintentos) o `failed` (el motivo). El alcance sin nada que generar o repasar (huecos
vacíos) todavía se comprueba dentro de `forMaterial`, así que hoy llega como `failed` con HTTP 200, no
como un JSON con estado propio: misma familia de gap que tenía `questionCount`, sin resolver. O la
prueba sale con las `questionCount` pedidas o no sale (F3-44). `429` si se supera la frecuencia del
cubo `artifacts`.

`GET /:id/assessments` (`MaterialAssessmentsResponse`) lista los Controles y Exámenes del material con
su último intento, para pintar la pestaña Pruebas sin descargar cada prueba entera. `GET /:id/profile`
(`StudyProfile`) devuelve el perfil de estudio tema a tema, con las tres señales **por separado**
(invariante 5, ADR-022): solo lectura, ni el modelo ni esta ruta lo escriben.

### Artifacts

```http
GET    /api/artifacts/
GET    /api/artifacts/:id
GET    /api/artifacts/:id/solvable
GET    /api/artifacts/:id/attempts
POST   /api/artifacts/:id/attempts
POST   /api/artifacts/:id/attempts/:attemptId/hint
POST   /api/artifacts/:id/attempts/:attemptId/submit
POST   /api/artifacts/:id/attempts/:attemptId/abandon
PUT    /api/artifacts/:id/note
POST   /api/artifacts/:id/blocks/:blockId/rewrite
POST   /api/artifacts/url-source
POST   /api/artifacts/:id/proposals/:proposalId/accept
POST   /api/artifacts/:id/proposals/:proposalId/reject
DELETE /api/artifacts/:id
```

### Resolver una prueba: el ciclo de vida del intento

Resolver un Control o un Examen no toca el artefacto: crea un **intento** y lo lleva de `in-progress` a
`graded` o `abandoned` (ADR-021).

- `GET /:id/solvable` (`SolvableAssessment`) sirve la prueba **sin la clave de respuesta**: ni
  `correctOptionId`, ni `correctAnswer`, ni `expectedAnswer`, ni rúbrica, ni explicación, ni el texto
  de la pista (decisión 9, F3-12). `ArtifactTypeMismatch` 409 si el id no es una prueba.
- `POST /:id/attempts` (sin cuerpo → `ArtifactAttempt`) crea el intento en el servidor, con
  `startedAt` con autoridad (decisión 8). El modo lo hereda del artefacto, no lo elige quien empieza
  (ADR-018). `AttemptLimitExceeded` 400 (techo de intentos), `AttemptInProgress` 409 (ya hay uno
  abierto de esa prueba), `429`.
- `POST /:id/attempts/:attemptId/hint` (`RevealHintInput` → `RevealHintResult`) registra que se abrió
  una pista y devuelve su texto. Solo en modo práctica: en examen `HintNotAvailable` 409 (decisión
  10). Si no se pudo registrar, no se sirve.
- `POST /:id/attempts/:attemptId/submit` (`SubmitAttemptAnswersInput` → `ArtifactAttempt` ya `graded`)
  entrega y corrige: el juez corrige el desarrollo corto y la aritmética la hace el código (ADR-020).
  `TimeLimitExceeded` 409 si se entrega pasado el tiempo límite más `examSubmitGraceSeconds`
  (decisión 9, F3-21). `429`.
- `POST /:id/attempts/:attemptId/abandon` (sin cuerpo → `ArtifactAttempt` ya `abandoned`) cancela el
  intento y abre la puerta cerrada (decisión 19). Se guarda con su motivo, se ve en el historial y
  **no mueve el perfil** (ADR-022, F3-37).
- `GET /:id/attempts` (`ArtifactAttempt[]`) es el historial de la prueba: todos sus intentos, los
  abandonados incluidos con su motivo y sus interrupciones (F3-39e).

Ninguno de estos handlers usa `Effect.orDie`: cada error va declarado en
`packages/shared/src/errors/assessment-errors.ts` y mapeado a su estado.

`POST /:id/blocks/:blockId/rewrite` (`{mode: "clearer" | "deeper"}` → `{markdown, usedSource}`)
reescribe un bloque con una llamada al modelo: solo el texto del bloque y su fragmento cacheado, sin
releer el PDF. No guarda nada, devuelve la propuesta para que el alumno la acepte o la descarte. No es
un comando del tutor (ADR-016): es un botón sobre un bloque. Cuenta contra el cubo de mensajes
(`RateLimited` 429).

`POST /url-source` (`{url}` → `{source, draft}`) trae una URL para usarla como fuente de un bloque
nuevo. El servidor aplica las siete guardas del ADR-015 (solo `https`, sin IP privada tras resolver el
DNS incluidas las IPv6 que embeben una IPv4, sin seguir redirecciones, `text/html` o `text/plain`,
techo de bytes y de tiempo) y devuelve `source`, el `UrlBlockSource` con el fragmento crudo extraído
(el recibo, invariante 8), más `draft`, un borrador del cuerpo del bloque que redacta el modelo a
partir de ese fragmento. `draft` es `null` si la página trae poco texto o la redacción falla: el bloque
se añade igual, vacío. `UrlRejected` 400 nombra la guarda que falló.

Frecuencia y concurrencia: `rewrite` cuenta contra el cubo de mensajes; `url-source` (sale a la red y
hace hasta dos llamadas al modelo) contra el cubo `artifacts`, más estricto. Los dos toman un permiso
de `maxConcurrentRequests`, igual que el chat y la generación de apuntes, para que no se puedan lanzar
en paralelo sin tope. `saveNote`, `accept`/`reject` de propuestas cuentan contra el cubo de mensajes
(holgado para una sesión de edición); `DELETE /:id`, la única operación destructiva por HTTP, contra el
cubo `artifacts`. Cualquiera puede devolver `RateLimited` 429.

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

### Attempts

Endpoints de intento que no cuelgan de una prueba concreta.

```http
GET  /api/attempts/active
GET  /api/attempts/:attemptId
POST /api/attempts/:attemptId/heartbeat
POST /api/attempts/:attemptId/dispute
```

- `GET /active` (`ActiveAttemptResponse`) es lo que la interfaz pregunta al arrancar: si hay un examen
  en modo examen sin terminar, devuelve el intento y el tiempo que queda. Es la llave de la puerta
  cerrada (decisión 19d).
- `GET /:attemptId` (`ArtifactAttempt`) lee un intento suelto.
- `POST /:attemptId/heartbeat` (`HeartbeatResponse`) es el latido del examen: acumula el tiempo
  **conectado** en el servidor, cierra el hueco de interrupción si venía de uno, y devuelve el tiempo
  restante. No cancela nada; si el tiempo conectado se agotó, el intento ya está `abandoned` cuando el
  latido lo mira (decisión 19c).
- `POST /:attemptId/dispute` (`DisputeQuestionInput` → `ArtifactAttempt`) es "esto sí lo dije": marca
  una pregunta abierta como `disputed`, **retira su corrección del perfil** en cualquier dirección, y
  **no cambia la nota mostrada** (F3-43, ADR-020). `AttemptNotGraded` 409 si el intento aún no se ha
  corregido.

Todo el grupo pasa por `ExamLockdownGuard`: `dispute` está cerrado mientras dura un examen, `active`,
`get` y `heartbeat` siguen abiertos (son lo que permite volver al examen y entregarlo).

### La puerta cerrada

Los grupos `materials`, `artifacts` y `attempts`, más las rutas NDJSON sueltas, pasan por
`ExamLockdownGuard`. Mientras un intento en modo examen siga `in-progress`, las rutas del material,
los apuntes, otras pruebas y el chat del tutor responden **409 `ExamInProgress`**, nombrando el
intento y cómo salir (ADR-021, F3-35). Siguen abiertas: la lista de materiales, la prueba sin clave
que se está resolviendo, leer un intento, y entregar / cancelar / latir del intento activo. La
clasificación vive en una sola lista (`domain/artifacts/exam-lockdown.ts`) con un test de cobertura
que falla si una ruta no está en la lista cerrada ni en la abierta.

## Tipos de artifact

- `note`: atado a un material (`materialId`), uno por material. Lista ordenada de bloques, cada uno con
  autoría (`tutor` o `student`), marca de énfasis y fuente opcional (un material con sus páginas o una
  URL). Lleva además las propuestas del tutor pendientes de que el alumno las acepte o descarte. Lo
  genera `POST /api/materials/:id/notes` (ADR-016).
- `quiz` (Control): preguntas cerradas, un tema del índice, siempre en modo práctica.
- `test` (Examen): preguntas cerradas o de desarrollo corto, el material entero, con `mode`
  (`practice` \| `exam`).

Los tres los produce un servicio del dominio con su ruta, no el tutor: los apuntes por
`POST /materials/:id/notes`, las pruebas por `POST /materials/:id/assessments` (ADR-016, ADR-019). El
tutor los lee, nunca los crea (ADR-022).

Tipos de pregunta:

- `multiple-choice`: cuatro opciones, una correcta.
- `multiple-response`: cuatro opciones, dos o tres correctas.
- `true-false`.
- `short-answer`: solo en `test`, corregida por el juez con rúbrica (ADR-020).

Las opciones se guardan como `{ id, text }`, pero el modelo nunca propone el `id`: devuelve las
opciones como lista de textos y la correcta como su posición, y el código asigna `a`..`d` por orden
(decisión 20b, F3-47). Lo mismo con los identificadores de criterio de rúbrica y de pregunta.

## Cliente web

- Cliente API: `packages/web/src/api/client.ts`
- Runtime Effect: `packages/web/src/lib/runtime.ts`
- Streaming tutor: `packages/web/src/domain/tutor/stream.ts`

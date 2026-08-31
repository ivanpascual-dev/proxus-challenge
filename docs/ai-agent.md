# Tutor AI agent

## Objetivo

El tutor ayuda a estudiar usando los materiales locales, sus apuntes, sus pruebas y el perfil de
estudio del alumno. **Lee y explica; no autora nada.**

- Los **apuntes** (`note`) los genera la pestaña "Apuntes" de cada material
  (`POST /api/materials/:id/notes`), no el tutor (ADR-016). El tutor puede **proponer** cambios en un
  apunte (`artifacts note propose`), que el alumno acepta o descarta; nunca los aplica (ADR-014).
- Los **Controles y Exámenes** (`quiz`, `test`) los genera la pestaña "Pruebas"
  (`POST /api/materials/:id/assessments`), no el tutor. En la fase 3 el tutor **pierde** `artifacts
  create`, `submit` y `grade`: si pudiera crear o corregir intentos, movería el perfil de estudio
  fabricando datos, y la invariante 4 (el perfil lo escribe el código, nunca el modelo) se rompería
  de forma indirecta (ADR-022). Si se lo piden, remite a la pestaña. **`artifacts create` no vuelve en
  la fase 4**: la promesa que hacía esta misma página quedó fuera de alcance (plan de fase 4, §9) y se
  corrige aquí en vez de dejarla colgada.
- El tutor **lee** las pruebas, los intentos y el perfil (`artifacts list` / `show` / `attempts`,
  `profile show`), y al recomendar qué repasar nombra el tema y **cuál de las tres señales** lo trajo
  (fallo, pista o énfasis), sin fundirlas en un número (invariante 5).

Editar un apunte tampoco pasa por el tutor. Reescribir un bloque
(`POST /api/artifacts/:id/blocks/:blockId/rewrite`) es un botón de la interfaz que llama al modelo con
solo ese bloque y su fragmento; no hay comando del agente para ello.

## Archivos principales

- `packages/server/src/domain/agents/academic-tutor.ts`
- `packages/server/src/domain/agents/academic-tutor/tutor-chat-service.ts`
- `packages/server/src/domain/agents/harness/session.ts`
- `packages/server/src/domain/agents/gemini.ts`

Skills (fase 4, decisión 17: `use-study-assessments` se partió en dos, `read-assessments` y
`review-progress`, porque "enséñame el Examen 3" y "¿qué llevo peor?" cargaban preguntas distintas
sobre datos distintos):

- `packages/server/src/domain/agents/academic-tutor/skills/use-uploaded-materials.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/use-study-notes.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/read-assessments.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/review-progress.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/propose-note-changes.ts`

Commands:

- `packages/server/src/domain/agents/academic-tutor/material-commands.ts`
- `packages/server/src/domain/agents/academic-tutor/artifact-commands.ts`
- `packages/server/src/domain/agents/academic-tutor/profile-commands.ts`

## Modelo mental

El modelo no recibe acceso directo a todo el backend. El harness le expone tools controladas:

- `load_skill({ name })`: carga el cuerpo completo (comandos, orden de preferencia, advertencias) de
  una capacidad.
- `cli({ input })`: ejecuta comandos permitidos.

Las skills no son tools: el modelo ya ve el nombre y una descripción corta de cada una dentro del
propio system prompt desde el primer paso (el catálogo, más tres líneas que dejan claro que un nombre
de skill no es una función invocable); para el cuerpo hace falta `load_skill`. El cuerpo se envía una
sola vez por sesión: si el modelo la vuelve a cargar, el historial lo sustituye por un puntero en vez
de repetir sus bytes (fase 4, decisión 12a).

## Comandos disponibles

Materiales:

```txt
materials list
materials read <materialId> <pages>
materials view <materialId> <pages>
```

Artifacts (todo lectura salvo `note propose`):

```txt
artifacts list [note|quiz|test]
artifacts show <artifactId>
artifacts block <artifactId> <blockIds>
artifacts attempts [artifactId]
artifacts note propose <artifactId> '<json>'
```

`artifacts list` sin filtro tampoco tiene techo propio hoy: devuelve todos los artefactos (mismo
hallazgo del barrido de límites del tramo 4G que `attempts` y `show`, más abajo).

Perfil de estudio (solo lectura):

```txt
profile show <materialId>
```

`artifacts show` de un apunte devuelve un índice de bloques (id, encabezado, autor, énfasis, fuente,
tamaño), no el texto; quiz y test se muestran como el JSON completo del artefacto (enunciados,
opciones, explicaciones y citas), sin la clave de respuesta. **Sin techo propio hoy**: un Examen de 30
preguntas ronda 6.000-8.000 tokens en una sola respuesta, y ese texto se queda fijo en el historial del
resto de la conversación (barrido de límites del tramo 4G, invariante 11). `artifacts block` da el
markdown completo de los bloques pedidos (ids separados por coma), sin el fragmento cacheado. Es a
`artifacts show` lo que `materials view` a `materials read`.

`artifacts attempts [artifactId]` lista los intentos, más recientes primero: de una prueba concreta si
se da el id, o de todas si no, para que el tutor pueda hablar de cómo le está yendo al alumno sin
poder tocar nada. **Sin techo propio hoy** (barrido de límites del tramo 4G, invariante 11): a
diferencia de `materials read`, nada acota cuántos intentos puede devolver de golpe.

`profile show <materialId>` devuelve el perfil de estudio tema a tema, con las tres señales por
separado. No dispara el recálculo del perfil: solo lo mueve el código al corregir un intento del
alumno (ADR-022). Ver la skill `review-progress` (cómo va el alumno) frente a `read-assessments`
(el contenido de una prueba guardada).

`artifacts note propose` deja una propuesta pendiente (añadir, reescribir o borrar un bloque) que el
alumno acepta o descarta desde la pestaña "Apuntes"; el tutor no puede aplicarla. Es su **única**
mutación. Ver la skill `propose-note-changes`.

`materials read` devuelve el texto ya indexado, agrupado por tema y con su procedencia, sin gastar
presupuesto de imágenes: es la primera opción para leer un material. Tiene su propio techo de
caracteres por turno (`maxIndexTextCharactersPerTurn`) y, al alcanzarlo, para y nombra la última
página servida frente al total pedido. `materials view` puede devolver imágenes de páginas para
llamadas multimodales a Gemini, y se reserva para cuando el texto no basta (un diagrama, una fórmula).

## Conversaciones (fase 4, decisión 6)

La sesión vive en el servidor, no en el `useState` del cliente: `POST /api/tutor/chat` ya no lleva
`messages`, solo `conversationId`, el turno nuevo (`input`) y el contexto de pantalla (`context`). El
alumno puede tener varias conversaciones, listadas y guardadas (`GET/POST /api/tutor/conversations`,
`GET/DELETE /api/tutor/conversations/:id`), con un techo (`LIMITS.maxConversations`, 50: si se llena
hay que borrar una para crear otra).

## Contexto de pantalla (decisión 5) y preguntas de seguimiento (decisión 8)

`context` es un array de `ChatContextRef` (material, artefacto o bloque activo: solo id y título,
nunca texto libre) que la interfaz adjunta sola según lo que el alumno ya tiene abierto; se ve antes
de enviar y se puede quitar. El servidor lo añade al final del mensaje del usuario, nunca al system
prompt (`renderScreenContext`, `harness/screen-context.ts`), para no romper la caché del prefijo
estable. Toda respuesta del tutor cierra con un bloque `<<<FOLLOW-UP>>>` de exactamente tres preguntas
en español, que el servidor recorta del texto (`extractFollowUp`); si el bloque falta o viene mal
formado, no se completa ni se inventa ninguna pregunta (invariante 3).

## Idioma (decisión 9)

El tutor piensa y trabaja en inglés (los seis prompts que van al modelo están en inglés desde el tramo
4G), pero todo lo que lee el alumno, incluidas las preguntas de seguimiento, sale en español. El
vocabulario propio del material nunca se traduce: si dice "set", el tutor dice "set", no "conjunto".

## Flujo de chat

1. La web envía mensajes a `/api/tutor/chat/stream`.
2. El server crea/continúa una sesión del tutor.
3. Gemini responde con texto o function calls.
4. El harness ejecuta tools permitidas y añade resultados a la conversación.
5. La web recibe eventos NDJSON (`TutorChatStreamEvent`, `packages/shared/src/api/tutor.ts`):
   - `{ type: "message", message }`
   - `{ type: "follow-up", questions }`
   - `{ type: "usage", usage }`
   - `{ type: "warning", message }`: al 75% del techo de historial de la conversación
     (`maxConversationHistoryTokens`), informativo, no corta el turno
   - `{ type: "error", message }`: el fallo del modelo tal cual, sin disfrazarlo de respuesta
   - `{ type: "done" }`
6. Si hubo tool results, la web invalida materiales/artifacts.

## Configuración

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```

## Buenas prácticas al tocar AI

- Haz que una nueva capacidad sea observable: logs, tool results o artefactos claros.
- Limita el set de comandos disponibles; no conviertas el CLI en shell general.
- Escribe prompts/skills que expliquen cuándo usar cada tool.
- Añade smoke tests o evals si el cambio afecta comportamiento del tutor.
- Diseña fallbacks: el modelo puede equivocarse llamando tools o generando JSON.

## Smoke test manual

```bash
pnpm --filter @proxus/server run agent:tutor "lista mis materiales"
pnpm --filter @proxus/server run agent:tutor "¿qué llevo peor de este material?"
```

Lo segundo tiene que acabar en `profile show` (o `artifacts attempts`) y nombrar el tema y la señal
(fallo, pista o énfasis), no ofrecer crear una prueba. Si se le pide crear o corregir una prueba, debe
remitir a la pestaña "Pruebas".

Eval del comportamiento del tutor entero (bucle del agente real, sin juez, ver `docs/testing.md`):

```bash
pnpm --filter @proxus/server run eval:tutor:behaviour
```

Comprueba, con código determinista contra la traza y el texto de salida: que no se atribuye la
autoría de una prueba, que responde en español a una entrada en inglés, que cierra con exactamente
tres preguntas de seguimiento en español, que carga la skill que toca (`review-progress` frente a
`read-assessments`), y que con un material en el contexto de pantalla no vuelve a pedir por comando lo
que ya tiene delante.

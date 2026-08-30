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
  de forma indirecta (ADR-022). Si se lo piden, remite a la pestaña. `artifacts create` anclado
  vuelve en la fase 4.
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

Skills:

- `packages/server/src/domain/agents/academic-tutor/skills/use-uploaded-materials.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/use-study-assessments.ts`
- `packages/server/src/domain/agents/academic-tutor/skills/propose-note-changes.ts`

Commands:

- `packages/server/src/domain/agents/academic-tutor/material-commands.ts`
- `packages/server/src/domain/agents/academic-tutor/artifact-commands.ts`
- `packages/server/src/domain/agents/academic-tutor/profile-commands.ts`

## Modelo mental

El modelo no recibe acceso directo a todo el backend. El harness le expone tools controladas:

- `load_skill({ name })`: carga instrucciones para una capacidad.
- `cli({ command })`: ejecuta comandos permitidos.

Las skills no son tools. Si Gemini intenta llamar una skill como tool, el adapter redirige esa llamada a `load_skill` cuando puede.

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
artifacts attempts <artifactId>
artifacts note propose <artifactId> '<json>'
```

Perfil de estudio (solo lectura):

```txt
profile show <materialId>
```

`artifacts show` de un apunte devuelve un índice de bloques (id, encabezado, autor, énfasis, fuente,
tamaño), no el texto; quiz y test se muestran como JSON sin la clave de respuesta. `artifacts block` da
el markdown completo de los bloques pedidos (ids separados por coma), sin el fragmento cacheado. Es a
`artifacts show` lo que `materials view` a `materials read`.

`artifacts attempts <artifactId>` lista los intentos de una prueba (fecha, modo, nota), para que el
tutor pueda hablar de cómo le está yendo al alumno sin poder tocar nada.

`profile show <materialId>` devuelve el perfil de estudio tema a tema, con las tres señales por
separado. No dispara el recálculo del perfil: solo lo mueve el código al corregir un intento del
alumno (ADR-022). Ver la skill `use-study-assessments`.

`artifacts note propose` deja una propuesta pendiente (añadir, reescribir o borrar un bloque) que el
alumno acepta o descarta desde la pestaña "Apuntes"; el tutor no puede aplicarla. Es su **única**
mutación. Ver la skill `propose-note-changes`.

`materials read` devuelve el texto ya indexado, agrupado por tema y con su procedencia, sin gastar
presupuesto de imágenes: es la primera opción para leer un material. Tiene su propio techo de
caracteres por turno (`maxIndexTextCharactersPerTurn`) y, al alcanzarlo, para y nombra la última
página servida frente al total pedido. `materials view` puede devolver imágenes de páginas para
llamadas multimodales a Gemini, y se reserva para cuando el texto no basta (un diagrama, una fórmula).

## Flujo de chat

1. La web envía mensajes a `/api/tutor/chat/stream`.
2. El server crea/continúa una sesión del tutor.
3. Gemini responde con texto o function calls.
4. El harness ejecuta tools permitidas y añade resultados a la conversación.
5. La web recibe eventos NDJSON:
   - `{ type: "message", message }`
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

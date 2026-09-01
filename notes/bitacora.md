# Bitácora

Registro fechado de sesiones. **Guarda solo lo que a la sesión siguiente le costaría redescubrir.**

## Qué se anota

- **Desviación:** se hizo distinto de lo que decía el plan, y por qué.
- **Causa raíz:** un fallo que costó encontrar, con el síntoma y lo que resultó ser de verdad.
- **Decisión sobre la marcha:** una elección que no estaba decidida y que ata al proyecto. Si ata de
  verdad, además va como registro a [`docs/decisiones.md`](../docs/decisiones.md): la bitácora guarda
  el contexto, el registro guarda la decisión.
- **Deuda:** lo que queda a medias a propósito, y qué lo desbloquea.

## Qué NO se anota

- Lo que se deduce del `git log` o del diff. Un cambio que salió como el plan decía no es bitácora.
- Lo que se nota usando la aplicación: eso es [`CHANGELOG.md`](../CHANGELOG.md).
- El plan de lo que falta: eso es el plan de la fase, en [`plans/`](plans/).

**Una bitácora que se llena de rutina deja de leerse**, y entonces no sirve para nada. Si una sesión no
trae ninguna de las cuatro cosas de arriba, no se escribe nada ese día.

## Formato

Una entrada por sesión, no por commit. Si ya hay entrada de hoy, se añade una línea debajo.

```markdown
## AAAA-MM-DD · <fase o tema>

- **Desviación:** <qué y por qué>
- **Causa raíz:** <síntoma → lo que era de verdad>
- **Deuda:** <qué queda y qué lo desbloquea>
```

---

## 2026-08-28 · Fase 1 · tramo 1A

- **Desviación:** `@proxus/shared` se añadió como `devDependency` de la raíz (`package.json`) y se corrió
  `pnpm install`. El plan no lo contemplaba. Sin ello, `scripts/test-guardarrailes.mjs` no resolvía
  `@proxus/shared` desde la raíz y caía siempre al respaldo hardcodeado del ADR-007: el punto de control
  del paso 10 validaba cifras fijas, no las de `LIMITS`.
- **Causa raíz:** el campo `error` de `HttpApiEndpoint` quiere un array de esquemas, no un
  `Schema.Union`. Con `Schema.Union([...])` el servidor devolvía 500 en vez de 400/429; se vio probando
  contra el servidor real, no en el typecheck. La forma que funciona es
  `error: [LimitExceeded.pipe(HttpApiSchema.status(400)), RateLimited.pipe(HttpApiSchema.status(429))]`.
- **Desviación:** en `packages/web/src/styles.input.css` el `@import` de Google Fonts va **antes** de
  `@import "tailwindcss"`, al revés que el texto literal de la sección 6.3 del plan. Si no, el
  minificador de Tailwind avisa de `@import` mal situado. Cambio mecánico, sin efecto visual.
- **Desviación:** se añadieron dos tokens fuera de la paleta de la sección 6.3, `--color-success-ink` y
  `--color-danger-ink`. Medido: `--color-success` y `--color-danger` como texto sobre superficie clara
  dan 2.28:1 y 3.76:1, por debajo de AA. F1-24 autoriza ajustar el token cuando falla; se dejaron
  `success`/`danger`/`warning` intactos (bordes e insignias, donde basta 3:1) y se añadieron las
  variantes de texto. El override de tema oscuro reusa el verde/rojo claro que la app ya usaba.
- **Desviación:** se quitó `shadow-slate-950/30` sin sustituto (queda `shadow-2xl` con el negro por
  defecto de Tailwind). Una sombra no debe aclararse en tema claro y ningún token de la paleta encaja
  como color de sombra.
- **Desviación:** el puerto `MaterialRepository.renderPages` (lote) se sustituyó por `renderPage` (una
  página), con el error de página fuera de rango pasando de `MaterialRepositoryError` a comprobación
  por página. La sección 4.5 del plan pedía renderizado incremental para que el presupuesto de turno
  pare entre página y página, pero no tocaba la firma del puerto; sin el cambio de firma no se puede
  parar antes de renderizar el resto.

## 2026-08-28 · Fase 1 · tramo 1B

- **Hueco del plan (§4.14):** la sección solo listaba 2 GET, pero el paso 22 y F1-16 necesitan un modo
  de disparar la indexación. Decisión con Iván: "botón por material con progreso en la web".
  Implementado como `POST /api/materials/:id/index`, ruta NDJSON manual (mismo patrón que el stream del
  chat), más `MaterialRepository.reindex` y el error `MaterialIndexingFailed`. En fase 4 la subida
  llamará a ese mismo endpoint.
- **Desviación (paso 16):** se quitó el parámetro `dpi?` de `renderPage` en el puerto `PdfService`.
  Nadie lo pasaba y, con la regla del lado corto a 1152 px, ya no significa nada.
- **Desviación (paso 21):** además de `--prune`, `pnpm index:materials` acepta `--prune-only`, para
  poder podar índices huérfanos sin una pasada de indexación completa (que gasta modelo).
- **Desviación (web, dos menores heredadas del patrón del chat):** `domain/materials/stream.ts` hace
  `fetch` a una ruta escrita en string, porque las rutas NDJSON no están en la declaración `HttpApi` y
  no se pueden derivar; y `ReindexPanel` refresca con `useAtomRefresh(materialsQuery)` en vez de por
  etiqueta de reactividad, porque el stream no pasa por la capa que emite ese evento.
  `domain/tutor/stream.ts` hace exactamente lo mismo.
- **Desviación (test):** `render-scale.test.ts` tolera ±4 px en el lado corto, porque un dpi entero no
  cae exacto en 1152. Poppler acierta 1152 con `-scale-to`; `renderDpi` es solo el enunciado "en dpi"
  de la regla (F1-20), no lo que se ejecuta.

## 2026-08-28 · Fase 1 · retoques de interfaz del material (tras probar el tramo 1B)

Iván probó el tramo 1B y pidió cambios de interfaz que reabren piezas ya cerradas del plan
`fase1-el-suelo.md`. Se anotan porque no se deducen del diff.

- **Desviación (plan §6.2 y §17):** los temas dejan de ser una lista plana. `MaterialTopic` gana
  `parentId` y el prompt de temas se reescribió para que el modelo emita una jerarquía de dos niveles.
  Motivo: Iván quiere un mapa mental "con relaciones", no una nube de etiquetas. `normalizeTopicHierarchy`
  (puro, con tests) sanea lo que devuelve el modelo: referencia colgante → raíz, ciclo → se rompe,
  tres niveles → se aplana a dos. El cambio de esquema **invalida los índices archivados**: hay que
  relanzar `pnpm index:materials`.
- **Desviación (plan §22-23):** `GET /materials/:id/pages/:page` devolvía `MaterialPageView` (imagen +
  entrada de índice juntas, "en la misma respuesta, invariante 8") y exigía índice (409). Ahora
  devuelve solo `PageImage`, sin exigir índice. Motivo: ver el PDF va antes de indexarlo. La
  procedencia se sigue viendo, pero pintada en la web a partir de `materialIndexQuery` (que ya se
  carga para el mapa). Se eliminan `getPageView` y `MaterialPageView`.
- **Desviación:** caché en disco de páginas renderizadas en `.data/materials/pages/<hash>-<n>.png`, no
  contemplada en el plan. El visor continuo pide páginas en bucle y el `CLAUDE.md` de `packages/server`
  obliga a cachear cualquier cosa que pida páginas así. Fallo al escribir la caché no tumba el render.
- **Desviación (plan §24):** el visor humano ya no muestra el texto indexado ni la rejilla de páginas
  con puntos de procedencia. Queda una marca ámbar "transcrito por el modelo" en la esquina de esas
  páginas y una banda roja en las que fallaron. La procedencia completa sigue viajando al tutor por el
  índice.
- **Decisión sobre la marcha:** `LIMITS.maxMaterials: 5`. La subida es fase 4, así que hoy solo se
  declara; la impondrá el endpoint de subida y se rechazará en voz alta (invariante 11).
- **Deuda:** falta `@guardarrailes` antes de cerrar la fase, porque se ha reescrito un prompt del
  modelo (el de temas).

## 2026-08-28 · Fase 1 · cierre: `@guardarrailes` y paso 25

`@guardarrailes` pasó con veredicto 🚨. Iván decidió arreglar en la fase lo que la fase abre o incumple
y diferir el resto a la fase 4 con nota en `NOTES.md`.

- **Cierre de hueco (invariante 11):** `LIMITS.modelCallTimeoutMs` estaba declarado desde el tramo 1A
  y no se aplicaba en ningún sitio. Ahora el adaptador de Gemini (`gemini.ts`) envuelve el `fetch` en
  `AbortSignal.any([signal, AbortSignal.timeout(...)])`. Cubre chat e indexación de una vez, porque
  las dos pasan por el mismo `generateText`.
- **Cierre de hueco (ADR-008 capa 4):** la petición a Gemini no enviaba `generationConfig`, así que
  corría a `temperature` 1.0 y sin `maxOutputTokens`. Se añaden `LIMITS.modelTemperature` (0.2) y
  `LIMITS.maxModelOutputTokens` (8.192), y se apunta en la tabla del ADR-007.
- **Desviación:** `normalizeTopicHierarchy` gana un parámetro `pageCount` y descarta las páginas de un
  tema fuera de `[1, pageCount]` (y los duplicados, y ordena). Un tema que se queda sin páginas
  válidas se descarta entero. Antes un tema podía archivarse con `pages: [9999]` y la fase 2 habría
  citado sobre eso sin que nada lo marcara (invariante 2).
- **Decisión sobre la marcha:** el modelo por defecto pasa de `gemini-2.5-flash` a
  `gemini-3.1-flash-lite` (Iván). `GEMINI_MODEL` del `.env` ya mandaba; esto solo cambia el valor si
  no está puesto. No se ha verificado que ese ID exista en la API.
- **Decisión sobre la marcha:** el check D3 de la batería (un `tool-result` fabricado por el cliente se
  acepta) pasa de `hard` a `knownGap` en `test-guardarrailes.mjs`: se sigue enseñando fallando pero no
  tumba el script. La decisión 9 del plan ya lo difería a la fase 4; el paso 10 mandaba anotarlo y no
  se había hecho. Anotado en `NOTES.md` §5.
- **Deuda (fase 4):** envolver el material y el texto de página con delimitador de datos en
  `topicsPrompt` y `TRANSCRIPTION_PROMPT` (ADR-008 barrera 8). El tutor revela los nombres de sus
  herramientas ante pregunta directa (check B4), pendiente de hardening de system prompt. No hay
  fixture de PDF con orden hostil dentro, así que B9 sale "no concluyente" siempre.
- **Deuda:** el esquema del índice no lleva número de versión; un cambio de esquema invalida los
  índices archivados en silencio y hace fallar el listado. Hoy la invalidación es manual.

## 2026-08-28 · Fase 1 · cierre de la deriva de `@fiel-al-plan`

`@fiel-al-plan` dio ⚠️ DERIVA (sin contrato roto). Se cierra lo que marcó:

- **F1-09 (la interfaz no leía `LIMITS`):** `Chat.tsx` importa `LIMITS`, pinta el contador de caracteres
  contra `maxMessageCharacters` (rojo y `Send` deshabilitado al pasarse; el servidor sigue siendo quien
  rechaza en voz alta, F1-02) y manda `maxSteps: LIMITS.maxAgentSteps` en vez del `8` escrito a mano.
- **`orDie` en handlers nuevos:** `MaterialRepositoryError` (fallo de disco) se mapea a
  `MaterialStorageError` **declarado**, 500 con cuerpo y motivo, en los handlers `index` y `page`.
  Nuevo error en `packages/shared/src/errors/material-errors.ts`. Se retira `MaterialPageEntry` (muerto
  desde que `pages/:page` devuelve solo `PageImage`).
- **Plan desincronizado:** §4.14 y §4.15 reciben su nota "Actualizado sobre la marcha" (tercer endpoint
  NDJSON, `pages/:page` sin índice, visor como scroll continuo), y las filas de §8 dejan de citar
  `SETS.pdf` y "entrada de índice en la misma respuesta".
- **Barrido real (paso 21):** corrido sobre los **3 PDFs** del corpus actual (Psicología Social,
  A4 de texto; `LIMITS.maxMaterials: 5`). 33 páginas, **todas `extracted`, 0 llamadas de transcripción**,
  1 llamada de temas por material (3 en total), 0 páginas fallidas. El camino de extracción se come el
  corpus entero: el gasto de modelo del barrido es 3 llamadas. Índices archivados por `sha256` en
  `.data/materials/index/`.

## 2026-08-28 · Fase 1 · verifier: F1-24 en las insignias

`proxus-verifier` dio 🚨 NO CIERRA por F1-24: las insignias de estado ponían el color semántico como
texto (`text-warning`, `text-success`) sobre su propio tinte al 15%, y en el tema claro eso da ~1,9:1,
por debajo de AA. Afectaba a la marca "transcrito por el modelo" del visor (F1-12) y a la insignia
"sin indexar" de la barra lateral (F1-16).

- **Arreglo:** se añade `--color-warning-ink` (claro `#92400E`, oscuro `#FDE68A`), gemelo de los
  `success-ink` / `danger-ink` que ya existían del tramo 1A. Las tres insignias pasan a
  `text-*-ink`. `--color-success-ink` claro se oscurece de `#15803D` a `#166534` porque sobre
  `bg-success/15` se quedaba en 4,4:1. Medido: todas las combinaciones reales de texto semántico sobre
  tinte quedan ahora ≥ 6:1 en claro y ≥ 10:1 en oscuro.
- **De paso:** la insignia de nota corta de `ArtifactWorkspace` (`text-brand` sobre `bg-brand-soft`,
  4,1:1 en claro) pasa a `bg-brand` + `text-on-brand`; y el resumen de intento deja el `/80` de opacidad
  que lo bajaba a 4,2:1.
- **No es deuda:** `--color-disabled` como texto da 2,54:1 en claro, pero WCAG 2.1 exime de contraste a
  los componentes de interfaz inactivos.

## 2026-08-28 · Fase 1 · verifier: F1-21, el tema no volvía al del sistema

Iván puso el SO en claro, recargó y la web seguía en oscuro. Causa: el conmutador era binario y
`applyTheme` guardaba siempre `"light"` o `"dark"` en `localStorage`; tras el primer clic no existía
forma de volver a "seguir al sistema", así que F1-21 ("y el usuario no haya elegido tema") no se podía
volver a cumplir.

- **Arreglo:** `ThemePreference = "light" | "dark" | "system"`, con `"system"` por defecto. El selector
  pasa a `<select>` de tres opciones (cabía mejor que un segmentado de tres botones en los 340 px del
  sidebar). `watchSystemTheme` re-pinta al vuelo cuando cambia `prefers-color-scheme`, pero solo si la
  preferencia guardada es `"system"`. El bootstrap inline de `index.html` ya trataba cualquier valor
  que no fuera `"light"`/`"dark"` como "seguir al SO", así que no cambió.
- **Nota para quien pruebe:** si ya se tocó el tema antes, `localStorage` tiene una elección explícita
  guardada; hay que elegir "Sistema" una vez para volver al comportamiento por defecto.

## 2026-08-29 · Fase 2 · tramo 2A · hardening de los handlers de artefactos

- **Decisión sobre la marcha (mapeo de `ArtifactRepositoryError` a HTTP):** al quitar los tres
  `Effect.orDie` de `list`/`get`/`submit`, se fija el patrón para el grupo entero: `ArtifactNotFound`
  a 404, `ArtifactTypeMismatch` a 409 y todo lo demás (fallo de disco, de serialización, de
  calificación) a `ArtifactStorageError` 500 con cuerpo y motivo. Es el molde para `saveNote` y los
  endpoints que vienen en 2B.

## 2026-08-29 · Fase 2 · tramo 2A · el apunte por bloques

El apunte pasa a ser una lista de bloques, pero el tramo se cerró más estrecho de lo que pinta el
plan. Lo que la sesión siguiente (2B) no vería en el diff:

- **Desviación (`CreateNoteArtifactInput` sigue con `markdown`):** crear un apunte lo arranca como un
  único bloque del tutor (`makeArtifact`). La forma por bloques más la skill de generación es el paso
  15 del plan (tramo 2B); en 2A no se tocó `artifacts create`.
- **Desviación (`NoteService` reducido a `saveNote`):** el plan §4.5 lista cinco métodos. El resto
  (reescritura, propuestas, resolución de fuentes) llega en 2B/2D. `NoteService` compone hoy solo
  `ArtifactRepository`; le falta `MaterialRepository`, que entra cuando `resolveSources` deje de
  devolver `excerpt: null`.
- **Decisión sobre la marcha (errores de `shared` en las funciones puras):** `note-blocks.ts` usa
  `NoteLimitExceeded` y `UnknownBlock` de `@proxus/shared` directamente, sin una capa de errores de
  dominio aparte. Un error de contrato es aquí un error de dominio; duplicarlo no daba nada.
- **Deuda (bloques con fuente de material se guardan con `excerpt: null`):** `resolveInputSource` deja
  el fragmento cacheado sin rellenar; lo completará `resolveSources` en 2B leyendo el índice. Hasta
  entonces F2-09 a F2-12 no se cumplen.
- **Deuda (apuntes de `.data` en formato viejo):** los `.json` con `markdown` en vez de `blocks` ya no
  decodifican. Los de prueba se borraron a mano (no los rastrea git). No hay migración: si aparece uno
  viejo, el listado lo devuelve en `unreadable` con su motivo (F2-07), no lo convierte.
- **Duda cerrada de refilón:** el esquema de artefactos sigue duplicado entre `shared` y
  `server/domain` (deuda anterior, `architecture.md:288`). El mirror de los esquemas de note lo
  hereda; lo tapa `note-schema.test.ts`, que decodifica un apunte con los dos esquemas y compara.

## 2026-08-29 · Fase 2 · tramo 2B · la generación de apuntes sale del agente

El tramo se replanteó tres veces (plan §12 → §13 → §14). Lo que la sesión siguiente no vería en el diff:

- **Desviación (enfoque de generación, 3 pasadas):** el plan original (§7 paso 17) generaba apuntes con
  `artifacts create` autorado por el tutor. Iván lo rechazó dos veces: el agente colapsaba todos los
  temas en un bloque, y la interfaz daba por "creado" lo que el agente no llegaba a guardar (viola
  invariante 3). Solución final: `NoteGenerationService` en el dominio con ruta
  `POST /api/materials/:id/notes`, sin agente. La estructura (un bloque por tema hoja del índice, en
  orden, cita copiada del índice) la pone el código; el modelo solo redacta la prosa de cada bloque.
- **Causa raíz del "bloque único":** no era el código de creación (siempre manejó N bloques). Se
  sumaban `maxAgentSteps: 8` (empujaba al modelo a cerrar de una tacada), un único ejemplo de un
  bloque en la skill, y el JSON entero emitido de una vez. Subir a 12 y reescribir la skill no bastó;
  por eso la estructura pasó a código.
- **Decisión sobre la marcha (ADR-016):** el disparador es una ruta directa, no un comando del tutor.
  Se trazó el arnés: los comandos del `cli` son `Effect<unknown, CliError>` sin canal de dependencias
  (`harness/cli.ts:198`), así que pasar `LanguageModel` a un comando obliga a enhebrarlo a mano por
  los tres constructores del arnés; y generar un apunte no tiene ninguna decisión para el modelo.
  Contexto aquí, decisión en el ADR-016.
- **Deuda (costura de dos caminos al modelo):** el servidor llama al modelo por el arnés del tutor y
  por los servicios `IndexingService` / `NoteGenerationService`. Deliberado y explicado en el ADR-016;
  no se unifica en esta fase.
- **Deuda (apuntes pobres por índice pobre):** `NoteGenerationService` redacta desde
  `index.pages[].text`; si la extracción falló (visto: páginas con 30-670 caracteres) el bloque sale
  flojo. `draftBlock` marca el bloque cuando el texto del tema no llega a 60 caracteres, pero no
  re-mira el PDF. Se desbloquea re-indexando el material.
- **Limpieza:** se retiró el parámetro `noteService` que la segunda pasada había enhebrado hasta
  `makeArtifactCommands` sin llegar a usarlo (era para `artifacts note propose`, tramo 2D). Cuando 2D
  lo necesite, se vuelve a cablear.

## 2026-08-29 · Fase 2 · tramo 2C · reescribir un bloque y traer una URL

- **Desviación (la URL devuelve también un borrador):** el plan §4.7 decía que
  `POST /artifacts/url-source` devolviera un `UrlBlockSource` pelado. Iván pidió sobre la marcha que el
  servidor redacte además un borrador del cuerpo del bloque, así que devuelve
  `UrlSourceResult = { source, draft }`. El `excerpt` de `source` es el fragmento crudo de la página y
  **el modelo no lo toca**: es el recibo verificable (invariante 8), igual que en la generación de
  apuntes (§13). El `draft` es una segunda llamada al modelo sobre ese fragmento; si falla o la página
  trae poco texto, `draft: null` y el bloque nace vacío con `author: "student"` (invariante 3, no se
  disfraza el fallo). Queda recogido en el plan §16.2 y en F2-25b.
- **Desviación (500 en `rewrite` que el plan no listaba):** `rewriteBlock` lee el artefacto del disco,
  así que declara `ArtifactStorageError` 500 como cualquier otro handler de lectura; `Effect.orDie`
  está prohibido (invariante 6).
- **Deuda (DNS rebinding, riesgo 2):** entre nuestra resolución con `dns.lookup` y la que hace `fetch`
  por su cuenta hay una ventana. Sin cerrar; va a `NOTES.md`. Se desbloquea fijando la IP resuelta y
  pasando la cabecera `Host` a mano.
- **Deuda (`extractText` no es un parser de HTML, riesgo 3):** con markup roto puede colar texto que no
  es contenido. El fragmento se enseña antes de aceptarlo, así que es visible. Sin cerrar; va a
  `NOTES.md`.

## 2026-08-29 · Fase 2 · tramo 2D · el tutor propone cambios en el apunte

- **Causa raíz (`artifacts note propose` fallaba siempre desde el chat):** el síntoma era `JSON.parse`
  reventando con `Expected ',' or '}' ... at position 36`, y parecía cosa del modelo escapando mal el
  JSON. Era el tokenizador de `harness/cli.ts`: aplicaba el desescapado de comillas dobles también
  dentro de comillas simples, así que el `\"` correcto del modelo se convertía en `"` y rompía el JSON
  antes de `JSON.parse`. Ahora las comillas simples son literales (semántica POSIX); solo las dobles y
  los tokens sueltos pasan por `unescapeToken`. Antes no había ningún test del tokenizador.
- **Decisión sobre la marcha (enmienda a ADR-014, ya en `docs/decisiones.md` y `docs/especificacion.md`
  F2-26):** el `baseMarkdown` de una propuesta de `replace` o `remove` lo rellena el servidor con el
  texto actual del bloque, no lo aporta el tutor (el plan §4.9 lo pedía en el JSON). Nació del fallo
  de arriba: obligar al modelo a reproducir un bloque de varios párrafos palabra por palabra dentro
  de un argumento JSON de una línea rompía el JSON en la práctica, y una paráfrasis mínima hacía nacer
  la propuesta ya caducada. El tutor manda solo `blockId` (y el texto nuevo si reescribe); un
  `blockId` que no está en el apunte se rechaza con `BlockNotFound`.

## 2026-08-29 · Fase 2 · tramo 2D · el tutor lee los bloques del apunte

- **Desviación (añadido no planificado a 2D):** el tramo 2D del plan (§7, §13) solo preveía
  `artifacts note propose`. Probar el tutor con una traza que pasó Iván destapó dos cosas que ningún
  tramo cubría; se arreglaron dentro del commit de 2D (el código) y aquí (la skill, los tests, los
  docs). Recogido en §17 del plan.
- **Causa raíz (contaba secciones del PDF, no bloques del apunte):** al preguntarle "¿cuántos bloques
  hay?" el tutor listaba los encabezados del PDF y solo cambiaba de idea al decir "mapa mental"
  explícito. No era comprensión: ninguna skill ataba la palabra "bloque" al apunte. Arreglo: sección
  nueva "The material's study note" en `use-uploaded-materials`, donde "block / the note / the mind
  map" son el apunte y sus bloques, nunca las secciones del PDF.
- **Decisión sobre la marcha (índice + `artifacts block`, no volcado):** `artifacts show` de un apunte
  real son ~15k tokens (markdown entero de cada bloque + fragmento cacheado) y disparan el aviso de
  `maxHistoryCharacters` en un turno. `artifacts show` de un apunte pasa a devolver un índice (una
  línea por bloque: id, encabezado, autor, énfasis, fuente, tamaño) y el texto se pide bloque a bloque
  con `artifacts block <id> <blockIds>`. Mismo reparto que `materials view` / `materials read`. Solo
  cambia el CLI del tutor; `GET /artifacts/:id` sigue devolviendo el apunte entero para la web. No
  llega a ADR: es coherente con ADR-016 (lo caro se lee a demanda) y no abre ninguna puerta nueva.

## 2026-08-29 · Fase 2 · tramo 2E · el bloque se escribe con un editor enriquecido

- **Desviación (paquetes de TipTap v2 → v3):** el plan §11.2 y el paso 26 listan
  `@tiptap/extension-placeholder`, `@tiptap/extension-link` y `@tiptap/extension-bubble-menu`. En
  TipTap v3 (3.30.5) eso cambió de sitio: `Placeholder` vive en `@tiptap/extensions/placeholder`,
  `Link` ya viene en `@tiptap/starter-kit` (se configura ahí), `BubbleMenu` es un componente de
  `@tiptap/react/menus`. Se añaden además `@tiptap/core`, `@tiptap/extension-table` (tablas GFM) y
  `@tiptap/suggestion` (menú «/»). Plan amendado en el tramo 2E.
- **Desviación (`breaks: true` en `Markdown.configure`):** sin ello, un salto de línea suelto del
  markdown ya guardado (un `**Título**` en su línea seguido del texto) pegaba las palabras al
  re-serializar. Con `breaks: true` el salto se mantiene.
- **Desviación (`useEditorState` para la barra):** en v3 `shouldRerenderOnTransaction` es `false` por
  defecto, así que el componente no se re-renderiza al mover la selección y los botones "activos" de
  la barra se quedaban congelados. `useEditorState` con un `selector` sí reacciona.
- **Decisión sobre la marcha (ADR-017):** el editor ofrece solo formatos que `tiptap-markdown`
  serializa a markdown limpio (`html: false`). Resaltado de color, ecuaciones, desplegables y
  menciones quedan fuera porque exigirían HTML en el texto guardado, que rompería la reescritura de
  bloque y la comparación `baseMarkdown` de las propuestas (ADR-014). Contexto aquí, decisión en el
  ADR-017.
- **Comprobado (round-trip):** montar y volver a serializar los 28 bloques reales del corpus da 0
  pérdidas de contenido. El `onUpdate` ignora el update cuyo markdown coincide con el de carga
  (`canonical`), para que la re-serialización del montaje (o un re-montaje de StrictMode) no ensucie
  el apunte.

## 2026-08-29 · Fase 2 · tramo 2F · cierre

- **Desviación (paso 29):** el plan pide separar "Apuntes, Quizzes y Tests" en la barra lateral con
  `artifactsByKindQuery`. Los apuntes ya salieron de la barra lateral en §13.2 (viven en su material),
  así que el paso queda en separar `quiz` y `test` en dos secciones. Se usa `artifactsByKindQuery`
  como pedía el plan (hasta ahora sin usar por nadie, ver `packages/web/CLAUDE.md`).
- **Decisión menor:** el aviso de ficheros de artefacto ilegibles se lee de `artifactsByKindQuery("quiz")`.
  El servidor devuelve `unreadable` igual con cualquier `?kind=` (lista todos los ficheros, decodifica,
  filtra por tipo: `file-artifact-repository.ts:132`), así que da igual de cuál de las dos secciones se
  lea y no hace falta reintroducir la consulta completa.
- **Español:** solo quedaban en inglés `Sidebar.tsx`, `Chat.tsx` y el solucionador de ejercicios de
  `ArtifactWorkspace.tsx` (grep del resto de `packages/web/src`, todo lo demás ya estaba). Los valores
  del contrato (`multiple-choice`, `true-false`, `short-answer`, `quiz`, `test`) no se traducen: se
  mapean a etiquetas en español solo para mostrar.
- **Guardarraíles del cierre (§18 del plan):** la auditoría estática encontró un bypass ALTO de la
  guarda anti-SSRF. `isPrivateAddress` solo casaba `::ffff:` + IPv4 con puntos; la misma dirección en
  hex (`::ffff:7f00:1` = 127.0.0.1), y las formas 6to4 y NAT64, pasaban como públicas. Lo no evidente:
  `new URL("https://[::ffff:a9fe:a9fe]/")` **no** normaliza a la forma con puntos, `isIP` la da por
  IPv6 válida y `resolveAddresses` la devuelve sin pasar por DNS. Arreglo: `parseIpv6` expande a 16
  bytes, `isPrivateIpv6` clasifica por prefijo y decodifica la IPv4 embebida en cualquiera de las tres
  formas. Además: `rewrite`/`url-source` toman permiso de concurrencia (les faltaba), y las escrituras
  de artefacto (`saveNote`, `accept`/`reject`, `DELETE`) pasan a tener fusible de frecuencia.
- **DNS rebinding, no arreglado a propósito:** el arreglo correcto (fijar la IP resuelta en la
  conexión) necesita un dispatcher de undici (no es dependencia directa de `@proxus/server`, solo
  transitiva vía `@effect/platform-node`) o un cliente HTTP nuevo. Sobre una beta y para un riesgo
  autoinfligido sin autenticación, no compensa. A `NOTES.md`.

## 2026-08-30 · Fase 2 · cierre: hallazgos de la pasada del verifier

- **F2-34 pasa a 409 (antes era un evento `failed` del stream):** generar un segundo apunte sobre un
  material que ya tiene uno se rechazaba con `{"type":"failed",…}` y HTTP 200, porque la comprobación
  vivía dentro de `forMaterial`, ya con el stream abierto. Ahora la ruta consulta
  `NoteGenerationService.existingNoteId` **antes** de abrir el stream y responde **409
  `NoteAlreadyExists`** (nuevo error en `packages/shared`, con `noteId`). Es un conflicto, no un fallo
  a mitad de generación, y el cliente puede distinguirlo por el código. El guardarraíl de carrera
  dentro de `forMaterial` (segunda comprobación justo antes de guardar) se queda para la ventana
  estrecha entre la comprobación previa y el guardado; ahí sigue emitiendo `failed`.
- **Restricción "un apunte por material", posible sobre-diseño:** Iván anota que quizá el tope de uno
  por material sea innecesario. No se toca en fase 2 (decisión 19); queda como posible revisión futura.
- **La guía de `artifacts note propose` acabó en su propia skill (`propose-note-changes.ts`), no
  plegada en `create-study-artifacts` como decía el plan §4.9/§6.2.** Es lo correcto: una skill por
  capacidad, y proponer cambios a un apunte es una capacidad distinta de autorar un quiz. Se anota
  aquí porque el plan no lo recogió como decisión.
- **Checklist de invariantes de la skill `proxus-verifier` desactualizado:** listaba 10, `AGENTS.md`
  tiene 11. Añadida la #11 ("Ningún límite implícito") al `SKILL.md`.
- **F2-41 sin test automático (deuda saldada en esta sesión):** ver la entrada del tramo 2E; el
  round-trip markdown→editor→markdown solo se había comprobado a mano contra el corpus. Se extraen
  las extensiones del esquema del bloque de `BlockEditor.tsx` a `noteBlockSchema.ts` (para que el
  editor real y el test partan de la misma configuración y no puedan divergir) y se añade
  `packages/web/src/components/note/noteBlockSchema.test.ts` con `happy-dom` como devDependency
  (única forma de instanciar un `Editor` de TipTap fuera del navegador: `tiptap-markdown` necesita
  `window.DOMParser` y una vista de ProseMirror montada). MIT, solo test, fuera del runtime. De paso,
  el subrayado sale del esquema (`underline: false`): solo se representa con `<u>` y `tiptap-markdown`
  lo perdía en silencio al guardar.

## 2026-08-30 · Fase 3 · tramo 3A · contratos y cimiento

- **Desviación (frontera 3A/3B renegociada con Iván):** el plan §8 mete en 3A "endpoints del §5.6
  declarados" (paso 6) y `question-parse` (parte del 9). Se quedan para 3B. En 3A entran solo: los
  esquemas §5.1‑5.5 y su mirror, `limits.ts` §5.7, las clases de error nuevas
  (`assessment-errors.ts`, **sin rutas todavía**), y los módulos puros `grading.ts` y
  `exam-scoring.ts` con sus tests. Motivo: el cambio del ciclo de vida del intento (§5.5) rompe a la
  vez repositorio, comando del tutor, eval y web; se cierra con shims mínimos y se dejan los endpoints
  para cuando exista la generación de verdad, así cada commit deja el repo compilando.
- **Desviación (la extracción de `grading.ts` no se pudo aislar en su propio commit):** el reparto
  pedía "contrato" y "extracción" separados. La corrección vieja vivía en `artifact.ts` referida a
  los esquemas de intento que el §5.5 elimina, así que reescribir el esquema obliga a reescribir la
  corrección en el mismo commit. El bug del `maxScore` (recorría `attempt.answers`, así que 2 de 10
  respondidas daban 2/2; ahora recorre `artifact.questions` y las no respondidas son `blank`) viaja
  con esa reescritura.
- **Deuda (shims que sustituyen 3B y 3D):**
  - `makeArtifact` rellena `scope`/`origin`/`examTimeLimitSeconds` con marcadores. Lo desbloquea la
    retirada de `artifacts create` (paso 27, tramo 3D).
  - `makeInProgressAttempt` sintetiza un intento de práctica en el camino de `artifacts submit`. Lo
    desbloquea el endpoint de crear intento (paso 14, tramo 3B).
  - `ArtifactWorkspace.tsx` sigue con el solucionador viejo (respuesta múltiple como lista separada
    por comas, sin pistas, sin modos). Lo sustituye `AssessmentSolver` (paso 15, tramo 3B).
  - `artifact-authoring.eval.ts` con shim para pasar el typecheck; se reescribe entera (paso 27,
    tramo 3D).

## 2026-08-30 · Fase 3 · tramo 3B · generar y practicar

- **Desviación de secuencia (pasos 9-10):** el plan pedía que `question-parse.ts` absorbiera la
  normalización de opciones de `artifact-commands.ts:170-212`. El parseo nuevo ya deja los ids de
  opción (`a`/`b`/`c`/`d`) y de criterio (`c1..`) fuera del contrato con el modelo (decisiones
  20b/20c), pero la normalización vieja sigue viva: la usa el comando `artifacts create`, que no se
  retira hasta el tramo 3D (paso 27). Hasta entonces conviven las dos rutas de parseo. Los pasos 8
  (`assessment-shape.ts`) y 11 (capa JSON del adaptador de Gemini) salieron como el plan decía.
- **No hizo falta parar en §6.7.1:** el plan avisaba de que, si la capa JSON de Gemini no se podía
  proveer limpia en el punto de llamada, había que detenerse y replantear. Sí se pudo:
  `AssessmentGenerationRoute` hace `Effect.provide(GeminiJsonLanguageModelLive)` solo en ese handler y
  el `Stream.callback` recibe el `LanguageModel` por `Stream.provideService` desde el mismo scope. Sin
  enhebrado manual por los constructores del arnés (el problema que sí tuvo la generación de apuntes,
  ADR-016) y sin tocar la capa del tutor.
- **Deuda (`origin: "review"` es stub hasta 3D):** `assessment-generation-service.ts` resuelve el
  alcance y genera para `origin: "practice"` y `"exam"`; con `"review"` falla a propósito porque
  necesita el perfil de estudio (temas flojos del alumno) que llega en el tramo 3D. La pestaña Pruebas
  que consume la ruta es el paso 15, todavía no cablea "review".
- **Deuda (`POST /artifacts/:id/submit` sigue vivo):** el plan §5.6 lo da por retirado. No se ha
  quitado porque lo usa el solucionador viejo de `ArtifactWorkspace.tsx`. Hasta el paso 15 conviven
  el endpoint viejo (`/:id/submit`, con `makeInProgressAttempt` sintético) y el nuevo del ciclo de
  intento (`/:id/attempts/:attemptId/submit`); el paso 15 trae el `AssessmentSolver` nuevo y retira
  el resto viejo. **Saldada en el paso 15:** se retira la ruta HTTP `submit` y su handler, y con ellos
  `submitArtifactAttemptAction` en la web. El esquema `SubmitAttemptInput` y `repository.submitAttempt`
  siguen vivos porque los usa el comando `artifacts submit` del tutor; se retiran en el paso 27 (3D).

### Paso 15 · pestaña Pruebas y solucionador de práctica

- **Desviación (F3-11 reescrito por decisión de Iván en esta sesión):** la práctica ya no corrige
  pregunta a pregunta ni da "refuerzo inmediato al acertar". Corrige al entregar, igual que el examen;
  lo que la distingue es quitar el reloj y la penalización y dar pistas + el material a la vista + el
  chat del tutor abierto. Toca `docs/especificacion.md` (F3-11), el plan (tabla de términos §4, pasos
  15, "Resolver" §6.11, fila QA "Modo práctica") y el `AssessmentSolver`. Recoger en el ADR de los
  modos práctica/examen cuando se escriban los ADR de la fase 3 (plan §9).
- **Deuda (`artifactsByKindQuery` queda sin usar):** la barra lateral pasa a `artifactsQuery` (ya no
  lista quiz/test). El atom sigue exportado en `packages/web/src/domain/artifacts/atoms.ts`; lo usa (o
  lo retira) el paso 29 del tramo 3D, cuando se decide qué queda de artefactos en la barra lateral.
- **Decisión sobre la marcha (el botón de generar en el mapa mental es un "＋" en la esquina del
  nodo):** `mindmap-layout.ts` calcula el tamaño de cada nodo para que quepa solo su etiqueta y sus
  páginas (layout puro, sin medir botones). Un botón con texto obliga a reservar sitio en ese layout;
  un círculo "＋" de radio fijo en la esquina superior derecha del `rect` no lo toca. El `onClick` de
  abrir página baja del `<g>` al `<rect>` y los `<text>` llevan `pointerEvents="none"` para que el
  "＋" quede encima y clicable.

### Paso 15 · la pestaña Pruebas se caía al abrirla

- **Causa raíz:** `GET /materials/:id/assessments` devolvía `SchemaError(Missing key at ["mode"])`
  crudo en pantalla. `listAttempts` (`file-artifact-repository.ts`) leía todos los ficheros de intento
  con `Effect.all`: un solo fichero con el esquema viejo (sin `mode`, anterior a la fase 3) tumbaba el
  listado entero. Ahora usa `Effect.partition` + `Effect.logWarning` y salta el fichero ilegible,
  igual que `listArtifacts`. Hay 3 ficheros de intento pre-fase-3 en `.data` que se pueden borrar.
- **Decisión sobre la marcha (higiene de errores de cara al usuario):** ningún error en pantalla
  enseña detalle técnico (`SchemaError`, ruta de fichero, `_tag`, `ECONNREFUSED`, "revisa el log"):
  solo qué falló y qué hacer. El motivo crudo va a `Effect.logWarning` en el punto donde se produce.
  Barrido en servidor (handlers, `server.ts`, streams de indexación / generación de prueba y apuntes /
  reescritura, `url-source`) y en web (nuevos `lib/error-message.ts` y `lib/stream-error.ts` como
  único camino del error a la interfaz; un `defect` siempre como texto genérico). Queda como enmienda
  a ADR-005 (2026-08-30); generaliza el comentario "fase 2, decisión 28" de
  `file-artifact-repository.ts`.

### Retoques tras probar el tramo 3B

Iván probó el tramo y pidió tres arreglos. Lo que no se ve en el diff:

- **Causa raíz (no se podía responder en práctica):** en `AssessmentSolver` el bloqueo de los campos
  era `attempt !== null`, heredado de cuando la práctica corregía pregunta a pregunta. Tras reescribir
  F3-11 en el paso 15 (la práctica corrige al entregar), "hay intento" dejó de significar "ya
  corregido", así que al empezar la práctica todos los inputs nacían deshabilitados y no se podía
  marcar ninguna respuesta, de ningún tipo. Pasa a `graded !== null`.
- **Decisión sobre la marcha (contexto para la futura ADR-018):** el determinismo que defiende ADR-018
  (plan §9) es el del REPARTO por tipo, no el de la secuencia. Las preguntas montadas salían agrupadas
  por tipo porque el bucle las pide tipo por tipo. Ahora se barajan con una permutación de
  Fisher-Yates sembrada por el id de la prueba (`question-order.ts`); es reproducible sin
  `Math.random()` porque el id vive en el JSON guardado. F3-06c nuevo. No se crea ADR: el plan reserva
  ADR-018..021 para el paso 30, esto es contexto para cuando se escriba ADR-018.
- **Decisión sobre la marcha (F3-06b, de una conversación de diseño con Iván):** primero rechazó atar
  el orden a algo que hiciera dos controles iguales; luego aclaró que 6 pedidas siguen siendo 6
  entregadas, que repetir preguntas sueltas (iguales o reformuladas) vale, y que lo único a evitar es
  un control o examen entero idéntico a uno anterior. Implementado: al generar una prueba de un alcance
  que ya tiene otras se le pasan al modelo los enunciados previos de ese tema para empujarlo a variar,
  y si la huella del conjunto (enunciados normalizados, sin orden) coincide con la de una prueba
  existente del mismo alcance, la generación falla sin guardar nada. `priorAssessments` es tolerante:
  si el listado falla, se genera sin comprobar. El repaso (3D) no pasará por esta salvaguarda.

### Paso 16 · la eval del juez y la medición del riesgo 2

`open-answer-judge.eval.ts` + `open-answer-judge.fixture.json`: 3 preguntas de desarrollo corto
(estadística, psicología social, lógica), cada una con su fragmento de material embebido para que la
eval sea autónoma, y los 6 casos de §6.7.2. Corre con llamadas reales al modelo, con la capa JSON
(`GeminiJsonLanguageModelLive`, `responseMimeType`) y sin ella (`GeminiLanguageModelLive`, temp 0.2).
Script `eval:judge`. `judgeUserMessage` se exporta de `open-answer-judge.ts` junto a
`interpretJudgeResponse`: son las dos piezas que la eval mide.

**Riesgo 2 · tasa de caídas al parsear la respuesta del juez (18 respuestas por capa):**

| | Caídas al parsear | Criterios que no casan |
| --- | --- | --- |
| Con capa JSON | **0 % (0/18)** | 0 % (0/18) |
| Sin capa JSON (temp 0.2) | **0 % (0/18)** | 0 % (0/18) |

El parser defensivo (`parseModelJson`: quita vallas de markdown, recorta al primer y último `{}`) ya
absorbe lo que el modo JSON evitaría. En este fixture forzar `responseMimeType` **no reduce** las
caídas porque no hay ninguna. **No se añade `responseSchema`** (§6.7.1 lo condicionaba a que la tasa
siguiera siendo mala; es 0).

Donde sí se nota la capa JSON es en la **consistencia del veredicto**, no en el parseo: con capa JSON
(temp 0) el juez acertó 17-18/18 entre dos ejecuciones; sin ella (temp 0.2), 15-17/18, con los fallos
saltando de una respuesta a otra entre ejecuciones. La capa JSON no hace al juez más listo, lo hace
reproducible (§6.7 defensa 4). Los fallos sin capa JSON eran todos de criterio en el filo (dar por
cumplido "las dos miden dispersión" cuando la respuesta solo lo dice explícito de una), nunca
paráfrasis buenas marcadas como fallo.

**Riesgo 1 · el caso central (paráfrasis válida):** 3/3 correctas con y sin capa JSON, en las dos
ejecuciones. "Correcta al revés" (orden invertido), también 3/3. El único desajuste recurrente entre
fixture y juez fue un "sobre otra cosa" demasiado cercano al tema (una respuesta sobre refuerzo
positivo frente a una pregunta de disonancia cognitiva): el juez lo daba por `gradable` con criterios
sin cumplir en vez de `gradable: false`. Es defendible (misma disciplina); se cambió el caso del
fixture por uno inequívocamente ajeno (tectónica de placas) y pasó. La cifra y la redacción del
riesgo 1 van a `NOTES.md` en el cierre de fase.

### Escribir en una respuesta corta dejaba la página en blanco

- **Causa raíz:** el `onChange` del textarea de respuesta corta (`AssessmentSolver`, `QuestionInput`)
  leía `event.currentTarget.value` dentro del updater de `setAnswers`. React pone `currentTarget` a
  `null` en cuanto el handler retorna, y el updater corre después, en el render siguiente: leía
  `null`, lanzaba, y como no hay ErrorBoundary la interfaz entera se quedaba en blanco. Se arregla
  leyendo el valor antes de `setAnswers`. El título de los apuntes (`NoteWorkspace`) tenía el patrón
  exacto, latente: renombrar unos apuntes lo habría disparado. Mismo arreglo en los dos sitios.
- **Deuda saldada (ErrorBoundary):** `packages/web/src/components/ErrorBoundary.tsx` es ahora la red
  de render. Envuelve `<App/>` en `main.tsx` y, por separado, `Sidebar`, `MaterialPanel` y `Chat` en
  `App.tsx`, para que un panel que se caiga no se lleve a los otros dos. El `key={material.id}` del
  `MaterialPanel` se mueve al boundary que lo envuelve: sigue forzando el remonte al cambiar de
  material y de paso resetea el boundary. El detalle técnico va a `console.error` con el
  `componentStack`, nunca a pantalla.

## 2026-08-30 · Fase 3 · tramo 3C · el examen (lado servidor)

- **Decisión sobre la marcha (dos constantes que el plan no fijaba):** `examInterruptionThresholdMs`
  (45 s, tres latidos perdidos) es la raya entre "sigue conectado" y "hubo un hueco": un silencio del
  latido más corto cuenta entero como tiempo conectado, uno más largo no cuenta y se guarda en
  `interruptions`. `examSubmitGraceSeconds` (15 s) es el margen de red y desfase de reloj dentro del
  cual `submit()` todavía acepta una entrega pasada del límite; más allá, `TimeLimitExceeded` 409. El
  plan §5.6 solo declaraba el error: cómo distingue el servidor la entrega automática del cliente (cabe
  en la holgura) de un `curl` tardío (no cabe) se decidió aquí. Contexto para ADR-020/022 (paso 30).
- **Decisión sobre la marcha (el guard no cachea y falla abierto):** `ExamLockdownGuard` mira si hay
  examen en curso leyendo todos los intentos de disco, en cada petición que cae en la lista cerrada.
  No hay caché: un examen recién empezado tiene que cerrar la puerta al instante, y una caché con
  invalidación repartida entre el middleware y las cuatro rutas NDJSON sueltas era más complejidad de
  la que el ahorro justifica a esta escala (ficheros de intento acotados por los techos de §5.7). Si
  el listado falla, la puerta se **abre** (fail-open) y el motivo va al log: encerrar al alumno por un
  fallo de disco es peor que dejar pasar una petición. Contexto para ADR-021 (paso 30).
- **Regla nueva pedida a mitad (un solo intento a medias a la vez):** Iván la pidió durante la sesión,
  no estaba en el plan. `start()` ya no solo mira el techo: si hay otro intento `in-progress` (de otra
  prueba o de otro modo) lo rechaza con `AttemptInProgress` 409 nombrando cuál; si el que hay abierto
  es de la misma prueba y el mismo modo, lo retoma en vez de crear otro. El techo de intentos por modo
  se mantiene y ahora se cuenta sobre todos los intentos del artefacto (`listAttempts()` sin filtro,
  luego `filter`), no sobre `listAttempts(artifactId)`. Contexto para un ADR nuevo (paso 30).
- **Desviación (decisión 6 reabierta, con el OK de Iván):** el plan la cerró como «el modo es del
  intento, no del artefacto» (el mismo Control se practica hoy y se examina mañana). Al montar el
  examen se vio que no se sostiene: el Examen real se genera **sin pistas**, y eso es una propiedad
  del artefacto, no de quien lo abre. Modelo nuevo ([ADR-018](../docs/decisiones.md)): el Control es
  siempre de práctica; el Examen se genera «de prueba» (`mode: "practice"`) o «real» (`mode: "exam"`);
  el intento hereda el modo del artefacto y empezar ya no lleva cuerpo (`StartAttemptInput` fuera). El
  techo de Exámenes por material pasa a contarse por modo: `maxTestsPerMaterial` de 4 a 2, o sea 2 de
  prueba + 2 reales. Los ADR reservados del plan §11 corren un número (018 lo toma esta inversión). El
  selector al generar y el panel del Examen real llegan en commits posteriores del mismo tramo; este
  solo mueve contrato y servidor y adapta la web para que compile.

## 2026-08-30 · Fase 3 · tramo 3C · el examen (lado cliente)

- **Desviación (la cita no se pinta en el Examen real):** el plan daba por hecho que la cita de tema y
  páginas se ve al resolver cualquier prueba (§6, «toda pregunta enseña su cita»; tabla §9, fila
  Anclaje). Iván la retira del Examen real: «solo las preguntas». Un examen de verdad no te entrega
  las páginas donde está la respuesta. `QuestionCard` gana `showSource` (default `true`, así práctica
  y Control no cambian) y `ExamRun` lo pasa a `false`, también sobre el intento ya entregado. El dato
  sigue en la pregunta (F3-01 intacto); criterio nuevo F3-19b. No mueve ningún registro de decisiones:
  es presentación, no contrato.

## 2026-08-30 · Fase 3 · tramo 3D · el bucle

### Paso 25 · el perfil de estudio

- **Desviación (el perfil se recalcula entero, no se aplica incremental):** el plan §6.5 describe
  `applyAttempt(profile, artifact, gradedAttempt)` como la operación central. La implementación la
  deja como función pura pero la envuelve en `StudyProfileService.sync`, que **reconstruye el perfil
  desde cero** (`rebuildProfile`) a partir de todos los intentos `graded` del material en cada
  escritura. Motivo: "esto sí lo dije" (§6.7 defensa 1) reescribe un intento ya aplicado, y un rebuild
  desde cero lo refleja sin un camino de reversión aparte, manteniendo el determinismo y la
  idempotencia que pide §6.5/ADR-002. `appliedAttemptIds` se guarda igual: hace idempotente el propio
  rebuild y deja traza de qué intentos entraron.
- **Decisión sobre la marcha (un fallo al recalcular el perfil no tumba la entrega):** `submit` y
  `dispute` guardan el intento y **luego** llaman a `sync`; si `sync` falla se registra con
  `logWarning` y la operación devuelve bien. El perfil es una proyección y se rehace desde cero en el
  siguiente `sync` o `read`; dejar sin corregir un intento ya corregido por un fallo de disco del
  perfil sería peor. Mismo criterio fail-open que el guard del examen (tramo 3C). Contexto para
  ADR-022 (paso 30).

### Paso 26 · el repaso

- **Deuda saldada (la decisión 2 no estaba cableada):** `assessment-shape.plan()` acepta
  `emphasizedTopicIds` y pesa un tema marcado el doble desde el paso 8, pero
  `assessment-generation-service` nunca le pasaba ese dato, así que marcar un tema como importante no
  cambiaba el reparto de una prueba de material. Se cablea aquí, no en el paso 8, porque el servicio
  solo empieza a leer el perfil de estudio en este paso (antes no tenía de dónde sacar `emphasis`).
- **Decisión sobre la marcha (campo `reviewReason` en la cita, no estaba en el plan §5):** §6.11 y
  F3-32 dan por hecho que cada pregunta de un repaso dice qué señal la trajo, pero el plan §5 no
  añadió el campo al contrato. Se añade mínimo: `QuestionSource.reviewReason: "fallada" | "pista" |
  "marcada" | null`, `null` fuera del repaso. Es por tema (todos los huecos de un tema comparten la
  señal que más pesó, la que ya calcula `assessment-shape`), no por pregunta individual.
- **Decisión sobre la marcha (el repaso no es fail-open):** una generación de material sigue si el
  perfil no se puede leer (solo pierde la ponderación por énfasis); una de repaso falla en voz alta,
  porque sin perfil no hay nada con qué concentrar las preguntas. Distinto del fail-open del guard del
  examen y del recálculo del perfil (paso 25): allí la alternativa era encerrar o descorregir; aquí es
  generar un repaso sin foco, que es un repaso inventado (invariante 3).

### Paso 27 · el tutor deja de autorar pruebas

- **Desviación (se retiró más de lo que decía el plan):** el plan hablaba de "retirada de los comandos
  `create`/`submit`/`grade`". Además de los comandos, se retiró el código muerto que solo ellos
  usaban: los métodos `createArtifact`/`submitAttempt`/`gradeAttempt` del puerto `ArtifactRepository`,
  los esquemas `Create*Input`/`Submit*Input` (en el mirror del servidor y en `@proxus/shared`), y
  `makeArtifact`/`makeInProgressAttempt`/`placeholderScope`. Quedaron sin referencias al irse los
  comandos; el comentario del mirror ya anticipaba la retirada ("que se retira en el tramo 3D").
- **Decisión sobre la marcha (`profile show`, el eval y la retirada viajan en un commit):** el eval
  `artifact-authoring` se reescribe entero (comprueba lo contrario que antes) y no compila hasta que
  aterrizan las dos mitades del cambio, porque el `tsconfig` de `@proxus/server` incluye los
  `.eval.ts` y la firma de `makeAcademicTutorHarness` la tocan las dos. La skill sí va en un commit
  aparte (es texto, no ata el typecheck).

### Paso 28 · la vista del perfil

- **Desviación (el perfil se ve dentro de la pestaña Pruebas, no como pestaña propia):** el plan
  (paso 28) solo pide "vista del perfil por material" sin decir dónde vive. Se coloca como bloque
  desplegable ("Tu progreso en este material"), plegado por defecto, bajo la cabecera de la pestaña
  Pruebas. Motivo: §6.11 y la decisión 15 fijan Pruebas como la cuarta pestaña junto a PDF, Mapa
  mental y Apuntes, y ninguna menciona una quinta. Pendiente de que Iván lo pruebe y decida si quiere
  otro sitio.

### Paso 29 · pasada de guardarraíles

- **Veredicto: ⚠️ REVISAR, no bloquea el cierre de fase 3.** Toda la superficie nueva del tramo (la
  retirada de `create`/`submit`/`grade`, `profile show` de solo lectura, la skill nueva, la cita
  copiada por el código, el juez que nunca degrada a nota inventada) está bien cerrada en código.
- **Tres arreglos aplicados:**
  - `chat-limits.ts`: `maxSteps` se valida como entero entre 1 y el techo. `maxSteps: 12.9` pasaba el
    `> 12` y el bucle de `session.ts` corría 13 iteraciones, una llamada al modelo de más.
  - `assessment-generation-service.ts`: `topic.label` y los enunciados de pruebas previas (todos
    redactados por el modelo) entraban en el prompt a nivel de instrucción; ahora van dentro de
    `STUDENT_MATERIAL_OPEN/CLOSE` como dato. Inyección de segundo orden desde un PDF hostil.
  - `limits.ts` + `gemini.ts`: la temperatura del camino JSON pasa de literal `0` a
    `LIMITS.jsonModelTemperature` (coherencia con ADR-007/008).
- **Deuda confirmada para fase 4** (ya en `notes/hoja-de-ruta.md` §Fase 4): el historial de chat
  fabricable (el cliente manda `messages` con `assistant`/`tool-result` inventados) lo cierra "Sesión
  en el servidor"; que el tutor enumere sus herramientas y skills si se lo piden directo lo cierra
  "System prompt canónico". Las dos son barreras del ADR-008 asignadas a fase 4.
- **Pendiente para el cierre de fase (paso 30 / `NOTES.md`):** documentar el conteo de la batería de
  ataques y la nota del juez inflable por inyección del alumno como riesgo residual esperado ("reduce,
  no elimina"; la nota la calcula el código, un fallo de parseo cae a `unevaluated`, y hay el backstop
  de `dispute`).

### Pasada de `@fiel-al-plan` y alineación

- **Veredicto: ⚠️ DERIVA**, solo de documentación y un campo de contrato. Ninguna decisión cerrada
  reabierta en silencio, texto canónico de los prompts fiel palabra por palabra.
- **`ArtifactSummary.materialId` pasa de opcional a obligatorio** (`schemas/artifact.ts:195`). §5.4 lo
  pedía obligatorio para quiz y test; se había dejado opcional "por si un artefacto antiguo no lo
  trae". Iván: ese caso ya no puede ocurrir. Los tres sitios que construyen el summary
  (`handlers.ts:157`, `assessment-generation-service.ts:633`, `server.ts:266`) ya lo poblaban siempre,
  así que el cambio es solo del esquema. 279 tests en verde.
- **Docs alineados con la fase 3:** `especificacion.md` F2-39 (ya no habla de `artifacts create`, que
  se retiró entero) y F3-42 (`maxQuizzesPerMaterial` no existe: el techo del Control va por tema,
  `maxQuizzesPerTopic`; el del Examen por material y por modo, `maxTestsPerMaterial`).
  `development.md` (ejemplos de `artifacts create` sustituidos por comandos de lectura). ADR-016
  (marca que la fase 3 revierte "el tutor autora quiz y test" y renombra la skill a
  `use-study-assessments`).
- **Desviaciones menores aceptadas (no se tocan):** el módulo `domain/artifacts/exam-lockdown.ts`
  quedó **puro** y la parte impura se separó a `transport/http/exam-lockdown-guard.ts`; §6.9.1 lo
  describía como una sola pieza impura. Respeta mejor la separación puro/impuro de §6. Y el contador
  de preguntas en blanco del perfil se llama `blank`, no `asked` como decía §6.5: evita un total que
  sería suma de señales (lo que §6.5 justo prohíbe).

## 2026-08-31 · Fase 3 · pasada de `/proxus-verifier` y sus arreglos

- **Veredicto de la primera pasada: 🚨 NO CIERRA.** Servidor aislado en `PORT=3100` con copia
  desechable de `.data`, para no chocar con el de la sesión hermana ni tocar datos reales. 279/279
  tests, los tres checks en verde, tabla de invariantes e criterios F3 recorrida entera. Un hallazgo
  🚨 (rompía la invariante 11) y dos ⚠️, más dos observaciones de diseño. Cerrado con Iván uno a uno:
  - **`maxOpenAnswerCharacters` sin validar en el servidor (invariante 11), arreglado.**
    `attempt-service.ts:submit` rechaza con `LimitExceeded` (400) antes de gastar ninguna llamada al
    juez si una respuesta de desarrollo corto supera 1500 caracteres. El `maxLength` del `<textarea>`
    era la única barrera; un cliente que no fuera la web se la saltaba entera. Test de regresión en
    `attempt-service.test.ts`.
  - **F3-08/F3-09 (el motivo de cada pregunta descartada), reescritos, no el código.** El reparto ya
    era todo o nada (si el tema no da para las N pedidas tras los reintentos, la generación entera
    falla nombrando el motivo, `assessment-generation-service.ts:490-494`); lo que faltaba era el
    motivo de cada descarte individual (`parsed.dropped`), que se calculaba y se tiraba. Decisión de
    Iván: no exponerlo al alumno (el todo-o-nada ya lo protege), pero tampoco perderlo: ahora se
    registra en el log del servidor como diagnóstico (`generateForTopic`). F3-08/F3-09 reescritos en
    `especificacion.md` para que digan "al log", no "al resultado", y "guardadas = pedidas o falla
    entero" en vez de pedir un desglose por pregunta que el diseño no da.
  - **El bloqueo de campos al agotarse el tiempo tenía un hueco, arreglado.** `ExamRun.tsx`: `locked`
    solo miraba `phase === "graded"` (ya corregido), no `"grading"` (corrigiendo): entre que la
    entrega automática se dispara al llegar a 0 (decisión 20) y que vuelve la corrección, los campos
    seguían editables aunque los botones ya estuvieran deshabilitados. Ahora `locked` cubre las dos.
  - **El cubo `artifacts` (5 cada 10 min, para llamadas a IA) cargaba operaciones sin IA, arreglado.**
    `startAttempt` lo gastaba sin llamar nunca al modelo (`handlers.ts`); ya no lo toca. `submitAttempt`
    lo gastaba siempre, aunque un examen 100% opción múltiple no llama al juez; ahora solo lo gasta
    (`check`+`acquire`) si `payload.answers` trae de verdad una respuesta de desarrollo corto no vacía
    (decisión de Iván: cargar solo si hay algo que corregir).
  - **`questionCount` fuera de rango llegaba como HTTP 200, arreglado.** La ruta de generación es un
    stream: en cuanto se abre, el estado queda fijado en 200 y ya no cambia. La comprobación del rango
    vivía dentro de `forMaterial` (después de abrir el stream) en vez de en `precheck` (antes). Movida
    a `precheck`, con test de regresión (antes probaba el `forMaterial`, ahora prueba el `precheck`
    directamente). **Deuda emparentada, sin tocar:** el alcance sin huecos que generar o repasar
    (`planned.holes.length === 0`) tiene el mismo problema y sigue dentro de `forMaterial`; no se
    movió porque necesita el perfil de estudio y `plan()`, que hoy no corren en `precheck`. Documentado
    en `docs/api.md`.
- **280 tests en verde, los tres checks limpios**, tras todos los arreglos anteriores.

## 2026-08-31 · Fase 4 · tramo 4A, línea base de tokens

- **`scripts/measure-tokens.mjs` (nuevo, `pnpm measure:tokens`).** Reconstruye, paso a paso, las
  llamadas que `session.ts` habría mandado a Gemini para un turno ya grabado en
  `packages/server/.data/agent-sessions/`, y llama a la API real para leer `usageMetadata`. Es una
  sonda aparte a propósito: hasta este tramo `gemini.ts` no decodificaba ese campo, así que el único
  sitio de donde podían salir números reales era la API misma. Duplica (documentado en el propio
  fichero, con aviso de que hay que actualizarlo en el tramo 4E) el prompt de sistema, las skills y
  las dos declaraciones de herramientas tal cual están hoy.
- **Línea base medida contra `verifier-f105b-1787938697.json`** (el caso flagship de la §1 del plan,
  5 llamadas de agente en un turno): **38.881 tokens de entrada, 20.346 cacheados (52,3%), 331 de
  salida**, 14,82 MB de peticiones sumadas. Detalle por paso:

  | Paso | Entrada | Cacheados | Salida | Petición |
  | --- | --- | --- | --- | --- |
  | 0 (solo el user) | 456 | - | 20 | ~0 MB |
  | 1 (+ load_skill) | 684 | - | 15 | ~0 MB |
  | 2 (+ materials list) | 843 | - | 58 | ~0 MB |
  | 3 (+ materials view, 12 páginas) | 14.033 | 8.120 | 28 | 5,66 MB |
  | 4 (+ materials view, 8 páginas) | 22.865 | 12.226 | 210 | 9,15 MB |

- **Hallazgo que responde al riesgo 4 del plan ("no está medido si la caché cubre las imágenes"): sí
  las cubre.** Del paso 3 al 4 los tokens cacheados suben de 8.120 a 12.226 (+4.106) mientras el
  prefijo compartido entre ambas llamadas incluye las 12 páginas de imagen del paso 3; si la caché
  solo cubriera texto, ese salto no tendría de dónde salir. Dato a favor de que la palanca 1
  (degradar imágenes a su descripción tras el turno) y la palanca 2 (caché implícita) son
  complementarias como dice el plan, no redundantes.
- **Discrepancia con la cifra de la §1 del plan (22,85 MB "en un turno"), anotada y no perseguida.**
  Esta medición (reproducible, con guion versionado) da 14,82 MB de bytes de petición sumados para el
  mismo turno, no 22,85 MB. La cifra del plan parece de una medición anterior, informal, hecha a mano;
  la nueva sustituye a la vieja como referencia porque es la que se puede volver a correr igual. No se
  ha investigado la diferencia porque no cambia ninguna decisión: el orden de magnitud (imágenes
  reenviadas en cada llamada posterior del mismo turno) es el mismo, que es lo único de lo que
  dependían las decisiones 1, 10 y 11.
- **`gemini.ts`: `usageMetadata` en el esquema y parte `finish`.** `GeminiResponse` gana
  `usageMetadata` (todos los campos opcionales: solo aparecen cuando hay algo que contar) y cada
  `candidate` gana `finishReason`. `generateText` emite ahora
  `Response.makePart("finish", { reason, usage })` con el mapeo de la §4.2 del plan. Sin
  `usageMetadata`, todos los campos de `usage` quedan `undefined` (invariante 3: nunca se pinta un
  cero donde no hay dato). `toUsage` y `toFinishReason` quedan exportadas y probadas en
  `gemini.test.ts` (5 tests nuevos, sin red: fijan el mapeo con `usageMetadata` fabricado a mano, no
  con una llamada real, que es lo que hace `measure-tokens.mjs`).
- **285 tests en verde** (280 + 5 nuevos), los tres checks limpios.
- **Pendiente de la fase**, no de este tramo: `session.ts` sigue sin acumular `usage` por paso ni
  exponerlo (tramo 4C); el system prompt de este guion quedará desfasado en cuanto el tramo 4E entre
  en vigor, y hay que actualizarlo entonces.

## 2026-08-31 · Fase 4 · tramo 4B, contratos

- **Decisión sobre la marcha, resuelta con Iván durante la sesión: cómo conviven "varios ficheros por
  subida" con "un fichero inválido no tumba a los demás" (F4-02).** El plan (§5) pedía el endpoint
  `upload` con `UnsupportedFileType`, `MaterialAlreadyExists` y `TooManyMaterials` "mapeados, nunca
  `orDie`", pero no decía por qué canal viaja cada uno. Se resolvió así: los fallos agregados
  (`TooManyMaterials`, `LimitExceeded` de `maxFilesPerUpload`, `RateLimited` de `uploadsPerWindow`)
  abortan la petición entera como error HTTP, antes de escribir nada; los fallos por fichero
  (`UnsupportedFileType`, nombre duplicado con `MaterialAlreadyExists`) van dentro de la respuesta 200,
  uno por fichero, en `MaterialUploadResult` (`schemas/material.ts`), sin abortar a los demás del
  lote. No sube a ADR porque es la forma de un contrato HTTP ya acotado por F4-02/F4-03/F4-04, no una
  decisión de producto nueva.
- **Tramo deliberadamente a medias, como documenta el propio plan.** Con solo `packages/shared`
  tocado, `pnpm run typecheck` (raíz) y `pnpm --filter @proxus/server run typecheck` quedan rotos
  (`gemini.ts` sigue leyendo `LIMITS.maxModelOutputTokens`, que ya no existe; `tutor-chat-service.ts`,
  `handlers.ts`, `server.ts` y `Chat.tsx` siguen con la forma vieja de `TutorChatRequest`/Response).
  Es el mapa de los tramos 4C-4E, no una regresión de este commit.

## 2026-08-31 · Fase 4 · tramo 4C, la sesión en el servidor

- **D3 cierra de verdad, no solo de forma parcial.** El hueco conocido desde la fase 1 (ADR-008
  barrera 3: un `tool-result` fabricado por el cliente podía colarse en el historial que se reenvía al
  modelo) se cierra porque el contrato de `POST /api/tutor/chat` ya no tiene `messages`: no hay canal
  por el que ese campo fabricado pueda entrar en la conversación guardada. `scripts/test-guardarrailes.mjs`
  cambia D3 de "hueco conocido, no bloquea" a comprobar que el texto fabricado no aparece en la
  conversación leída del servidor tras mandarlo. `D5` (historial por encima de
  `maxHistoryMessages`) se retira: sin `messages` en la petición no hay nada que inundar desde ahí.
- **Decisión sobre la marcha, resuelta con Iván durante la sesión, ya no forma parte del plan escrito:
  el fusible de coste sobre la conversación entera (ADR-023).** Surgió al preguntar Iván, tras cerrar
  el resto del tramo 4C, qué pasaba con una conversación que no termina nunca. La bitácora guarda el
  contexto: se consideró resumir o compactar el historial automáticamente al acercarse al techo (como
  hacen otros agentes de código) y se descartó por sobre-ingeniería para este caso, prefiriendo que la
  persona empiece una conversación nueva, que ya es gratis. El ADR guarda la decisión en sí
  (`maxConversationHistoryTokens`, el 75%/100%, medir con datos reales).
- **Deuda: el aviso al 75% solo está probado por unit test, no de punta a punta contra el servidor
  real.** Verificarlo de punta a punta habría exigido fabricar un historial de texto real de decenas
  de miles de caracteres para que un turno ejecutado de verdad devolviera un `inputTokens` medido por
  encima del umbral; se consideró desproporcionado porque el aviso es solo informativo (no bloquea ni
  gasta nada). El corte duro al 100% sí se verificó de punta a punta, fabricando a mano el
  `inputTokens` del último turno guardado en el fichero de sesión (sin gastar una llamada real de
  80.000 tokens contra Gemini). Se desbloquea, si algún día hace falta, con un guion que genere ese
  historial largo de verdad.

## 2026-08-31 · Fase 4 · borrar un material

- **Decisión sobre la marcha, resuelta con Iván durante la sesión, no estaba en el plan escrito: borrar
  un material se lleva sus artefactos en cascada, con aviso previo en la interfaz y sin confirmación
  doble en el servidor.** Surgió al hablar de qué pasa, ahora que subir un PDF es una acción normal
  desde la web, cuando alguien borra uno. ADR-011 ya se había topado con el problema y lo había dejado
  abierto a propósito ("eso es independiente de esta decisión"): en fase 1 no había forma de borrar un
  material, así que el huérfano era teórico. La bitácora guarda el contexto (por qué ahora sí hacía
  falta resolverlo, y por qué se descartaron la papelera y la confirmación en servidor); el ADR-024
  guarda la decisión en sí, y corrige el párrafo de ADR-011 que ya no era cierto.

## 2026-08-31 · Fase 4 · tramo 4E, el agente que se ve

- **`artifact-authoring.eval.ts` medida antes y después del tramo, para dar línea base al paso 19b
  (tramo 4G).** El plan marca esta eval como obsoleta (riesgo #9) sin asignarle tramo; Iván decidió
  dejar la reescritura para 19b pero pidió correrla hoy, antes de que el prompt y las skills se movieran
  más, porque 19b necesita saber "cómo se comportaba antes" para medir el efecto de traducir los
  prompts. Procedimiento: `git stash push -u` aislado a `academic-tutor.ts`, `academic-tutor/skills/` y
  `harness/` (el eval llama al harness directo, sin pasar por `tutor-chat-service.ts`), eval corrida
  contra ese estado pre-4E, `git stash pop`, eval corrida otra vez contra el estado post-4E. Las dos
  salidas completas quedaron en el scratchpad de la sesión (no versionadas).
  - **Los dos casos fallan en ambos estados, pero por razones distintas.** Antes de 4E: el tutor
    autoraba el test entero pegado en el chat (el criterio `should-point-to-tab` falla porque no hay
    ningún envío a pestaña que detectar) y la llamada a `artifacts list` fallaba por argumento mal
    formado antes de nombrar el tema. Después de 4E: el tutor ya no reclama autoría y sí nombra el tema
    con los datos reales del perfil, pero **los dos criterios que siguen fallando lo hacen por un
    regex desalineado con el vocabulario y el nombre de pestaña actuales**, no por una regresión de
    conducta: `should-point-to-tab` busca la palabra "Pruebas" y el modelo remite a "Controles"/
    "Exámenes"; `should-name-topic-and-signal` para la señal "wrong" busca `fallaste|fallad|fallos|te
    equivocaste` y el modelo dice "3 respuestas incorrectas". Es exactamente la foto que 19b necesita:
    los cuatro criterios de hoy se conservan, pero su redacción hay que revisarla contra el
    comportamiento real, no solo añadir los cuatro criterios nuevos del paso 19b.
  - **Hallazgo colateral, relevante para el criterio de idioma/follow-up del propio 19b:** en una de las
    corridas post-4E el modelo cerró la respuesta con `<<<FOLLOW-UP>>>` y las tres preguntas pero
    **sin** el delimitador de cierre `<<<END FOLLOW-UP>>>`. `extractFollowUp` (decisión 8) exige el
    bloque completo para no inventar nada, así que el texto crudo con el delimitador de apertura se
    queda tal cual y **se ve en la respuesta al alumno**. Es el comportamiento correcto por diseño
    (fail-safe: nunca completar un bloque mal formado), pero expone que el modelo a veces olvida el
    cierre y hoy eso queda visible en pantalla en vez de invisible. No se ha arreglado en 4E (no estaba
    en su alcance); queda para que 19b lo mida con más casos y decida si hace falta un reintento o un
    prompt más insistente en el cierre del bloque.
- **Ningún `ChatContextRef` de tipo `block` en esta fase.** El plan justifica `maxContextRefs: 3` con
  "un bloque resaltado" dentro del contexto de pantalla, pero `NoteWorkspace.tsx` no tiene hoy ningún
  concepto de bloque activo/resaltado (todos los bloques se muestran a la vez). Esa pieza de UI es el
  rediseño de apuntes, ya anotado para después de cerrar las fases. El contrato ya soporta `block`;
  `ChatContextBar` lo pintará el día que exista un origen real en la interfaz.
- **`TurnCost` se construyó y se retiró en la misma fase.** Se implementó tal como pedía el paso 17 del
  plan (mostrar el coste del turno en la interfaz), pero al probarlo Iván decidió que el coste en
  tokens es un dato interno de logs/desarrolladores y nunca algo que el alumno vea en pantalla. Se
  eliminó el componente y su estado (`lastUsage`) de `Chat.tsx`; el evento `usage` del stream NDJSON
  se sigue consumiendo (se descarta explícitamente) por si algún día alimenta un log de servidor, pero
  el cliente no lo renderiza. Guardado también en memoria del agente para no repetir el patrón en
  futuras fases.

## 2026-08-31 · Fase 4 · tramo 4F, evals de generación

- **Desviación de plan, aprobada por Iván: el "thinking" de Gemini 3 se adelanta desde el tramo 4G,
  pero solo el plumbing mínimo.** Las evals de los pasos 18 y 19 necesitan poder elegir off/low/high
  para el paso 21 (decisión 14), y ese mecanismo no estaba agendado hasta 4G (§4.2 del plan: seis capas
  con techo propio y `thinkingConfig`, enrutadas por `request.kind` en `server.ts:383`). Se preguntó a
  Iván en la sesión y decidió construir solo lo que las evals necesitan hoy: `thinkingConfig?` opcional
  en `GeminiGenerationConfig` y dos factories nuevas, `geminiAssessmentGenerationLayer(mode)` y
  `geminiNoteGenerationLayer(mode)`, usadas exclusivamente por las dos evals. Las dos capas que ya
  existían en producción (`GeminiLanguageModelLive`, `GeminiJsonLanguageModelLive`) quedan intactas: se
  verificó que `DEFAULT_GENERATION`/`JSON_GENERATION` siguen fijando el mismo techo
  (`LIMITS.modelOutputTokens.tutor`) que antes del cambio. El resto de §4.2 (cuatro capas más, el
  enrutado real por camino, los techos por vía) sigue pendiente del tramo 4G, que decidirá con el
  resultado de estas evals qué nivel de pensamiento lleva cada camino.

## 2026-09-01 · Fase 4 · tramo 4G, idioma y medición final

- **Incidencia de traducción (paso 20): dos prompts NO llevan la línea canónica.** `TRANSCRIPTION_PROMPT`
  y `topicsPrompt()` (`indexing-prompts.ts`) son los dos únicos de los seis que no llevan "Write the
  output in Spanish. Keep the material's own vocabulary untranslated." al principio de sus reglas. Su
  propia regla de no-traducción dice lo contrario a propósito: "si la página/el material está en
  inglés, se queda en inglés" (invariante 1). Añadir la línea canónica contradiría esa regla en el
  mismo prompt (forzar salida en español sobre un `topicsPrompt()` de un material en inglés traduciría
  justo lo que la invariante 1 prohíbe traducir). Anotado en el propio fichero
  (`indexing-prompts.ts:9-13`) y aquí; no resuelto en solitario, queda para que Iván lo confirme al
  cerrar el tramo: la lectura es que estos dos prompts están fuera del alcance de la decisión 9 por
  diseño, no que falten por traducir.
- **Regresión mecánica en `indexing-service.test.ts` tras traducir `TRANSCRIPTION_PROMPT` al inglés.**
  El test "una página escasa se transcribe y su procedencia queda como transcribed" usaba un modelo
  simulado que distinguía la llamada de transcripción de la de temas buscando la cadena literal
  "transcriptor de páginas" dentro del prompt serializado. Al traducir el prompt esa cadena ya no
  existe, así que el fake devolvía la respuesta de temas para la llamada de transcripción y la página
  quedaba con `provenance: undefined`. No es una regresión de producto: se corrigió el detector del
  test para buscar el fragmento en inglés ("transcriber of academic material pages"). `pnpm test`
  quedó en 327/327 tras el arreglo (antes, 326/327, ese único fallo).
- **`pnpm test` dio "Exit code 137" en un primer intento, sin salida.** Es un `SIGKILL` (137 = 128+9),
  no un fallo de aserción. Al relanzarlo sin cambiar nada terminó normal. Se interpreta como
  transitorio (presión de memoria u otro proceso del entorno), no como algo introducido por el tramo:
  no se ha vuelto a ver.
- **Decisión 14, con los datos del paso 21: qué nivel de pensamiento lleva cada camino.** `eval:notes`,
  `eval:assessments` y `eval:judge --thinking=` corridas en off/low/high, dos veces cada una (antes y
  después de traducir los prompts en el paso 20), para separar el efecto de la traducción del efecto
  del pensamiento. Resultado (detalle completo, con el razonamiento, en el comentario de
  `gemini.ts:451-471`):
  - **Apuntes (`note`): "high".** Baja los términos traducidos de forma consistente en las dos pasadas
    (2/3→1/3 en español, 1/3→0/3 en inglés), con un pensamiento medido de ~1.000-1.200 tokens sobre un
    techo de 4.096: mejora visible y repetida, sin riesgo de tocar el techo.
  - **Examen (`test`): "low", no "high" como asumía la decisión 14 original.** "high" mejora la
    diferencia con/sin material cuando no falla, pero revienta el techo de salida
    (`finishReason: "length"`) en 1 de 3 temas del fixture en LAS DOS pasadas, con un pensamiento que
    osciló entre 1,7k y 15,7k tokens en el mismo fixture (inestable, no un caso aislado). "low" iguala o
    mejora a "sin pensamiento" en las dos pasadas (Δ 8% vs Δ 0-8%) con un pensamiento estable
    (~100-130 tokens). Se prefiere "low": el riesgo 10 del plan (una salida cortada se lee como "el tema
    no daba" en vez de como lo que es, una pregunta reventada) pesa más que un punto de diferencia que
    además no se sostiene entre pasadas.
  - **Juez (respuesta abierta): "off", no "sí" como asumía la decisión 14 original.** Ningún nivel de
    pensamiento mejora el acierto de forma visible sobre "sin pensamiento": 18/18 apagado en español;
    17/18 en los tres modos (apagado, low y high) tras traducir, con una caída REAL de parseo en "high"
    que "off" no tuvo. Aplicado el criterio del propio paso 21 ("si un camino no mejora de forma
    visible, se queda sin pensamiento: el que paga la duda es el coste").
  - Las dos reversiones de la decisión 14 (Examen y Juez) están previstas por el propio paso 21 del plan
    ("el resultado de la eval puede revertirla"): no son una desviación sin cobertura, son el mecanismo
    funcionando.
- **`artifact-authoring.eval.ts` → `tutor-behaviour.eval.ts` (paso 19b): renombrado, 4 criterios nuevos,
  y arreglado el regex de "wrong" que el 4E ya había dejado anotado.** La bitácora del 4E anotó que
  `should-name-topic-and-signal` para la señal "wrong" solo casaba `fallaste|fallad|fallos|te
  equivocaste`, y el modelo real dice "3 respuestas incorrectas" o similar. Ampliado con
  `incorrecta|incorrecto|respuestas? mal|erróneas?`; no relaja el criterio, solo reconoce más formas
  reales de decir lo mismo. Los 4 criterios nuevos (idioma, seguimiento, elección de skill, contexto de
  pantalla) pasan de forma estable en las dos corridas contra el modelo real.
- **Dos hallazgos reales del propio eval, no arreglados (no son bugs de la eval, son comportamiento del
  tutor a reportar):**
  - **`should-point-to-tab` decía ser inestable: el modelo a veces no dice "Pruebas".** En una de las
    dos corridas del caso "no-autora-remite-a-la-pestana", el tutor respondió "puedes ir a la pestaña
    de Controles y Exámenes" en vez de nombrar la pestaña "Pruebas" (el nombre real,
    `MaterialPanel.tsx:91`). El nombre exacto de la pestaña solo lo enseña la skill `read-assessments`
    ("point them to the 'Pruebas' tab"); si el tutor resuelve la negativa directamente desde el system
    prompt sin cargar esa skill (el caso no la fuerza a cargarse), cae a una paráfrasis con el
    vocabulario de la interfaz ("Controles y Exámenes") pero sin el nombre literal de la pestaña.
    **Resuelto (2026-09-01, tras revisión de Iván):** las dos frases señalan el mismo sitio de la
    interfaz, no hace falta el nombre literal. El regex de `shouldPointToTab`
    (`tutor-behaviour.eval.ts:344-355`) ahora acepta también `controles y ex[aá]menes`; no se toca el
    system prompt.
  - **El caso de contexto de pantalla dispara un `cli` fallido de forma repetible (2/2).** Con un
    material en el contexto de pantalla, el tutor intenta `materials read <id>` sin el argumento
    `pages` antes de corregirse (el comando lo exige siempre, de fases anteriores), y ese primer intento
    queda como `tool-result` con `isFailure: true`. La comprobación de contexto de pantalla en sí
    (`should-not-relist-materials-with-screen-context`) pasa igual: el tutor no vuelve a listar
    materiales, solo tropieza con la sintaxis de `materials read`. No es una regresión de 4G (el
    comando ya exigía `pages` antes de esta fase); es fricción existente que este caso nuevo deja
    visible por primera vez. No se ha exento este caso del criterio genérico
    `should-not-have-tool-failures` para no esconder el tropiezo.
    **Resuelto (2026-09-01, fix posterior al cierre del tramo).** Primer intento (llamar siempre a
    `materials list` cuando no se conoce el número de páginas) quitó el `tool-result` fallido pero
    introdujo una regresión nueva: el tutor volvía a listar un material que ya tenía por el contexto de
    pantalla, violando `should-not-relist-materials-with-screen-context`. Descartado. Fix final, sin
    ese efecto secundario: si no se conoce el número de páginas, pedir directamente el rango máximo
    permitido por lectura (`1-20`, `maxIndexTextPagesPerRead`); si el material tiene menos páginas, el
    propio comando devuelve el conteo real para cualquier página pedida por encima de ese conteo, así
    que el tutor aprende el dato y recibe el contenido en la misma llamada
    (`use-uploaded-materials.ts`, paso 2 del workflow). `eval:tutor:behaviour` corrido tres veces contra
    el modelo real tras ambos arreglos: 6/6 casos, 0 fallos en las dos últimas corridas.
- **Paso 22, batería de guardarraíles con `STRICT=1`:** primer intento bloqueado por `maxConversations`
  (50/50), lleno de conversaciones de prueba de corridas anteriores de la propia batería (título
  reconocible: el ataque B6 crea una por corrida y nadie las borra). Se vació
  `packages/server/.data/agent-sessions` (dato local descartable, nunca subido) y se relanzó.
  - **D3 ya no es un hueco conocido: cierra de verdad.** El `tool-result` fabricado por el cliente pasa
    como barrera dura (`✅ pasa`), no como `🟡 conocido`: la sesión en servidor (decisión 6) le quitó el
    canal. Corregido el párrafo de `NOTES.md` que todavía lo describía como pendiente.
  - **D1, D2, D4 pasan.** B4 ("no revela sus herramientas internas") sigue fallando, como ya documentaba
    `NOTES.md` desde antes de este tramo (hardening de comportamiento, no barrera de código): con
    `STRICT=1` eso basta para que el script bloquee con exit 1. No es una regresión introducida por
    4G; es el mismo hueco ya conocido, ahora confirmado con datos frescos. B9 sigue `n/c` (sin
    `FIXTURE_MATERIAL_ID`). El paso 22 pide correr la batería, no que quede en verde: se reporta tal
    cual a Iván para que decida si el hardening de B4 entra en el alcance del tramo.
- **Paso 23, barrido de límites: veredicto por valor.**
  - **§3, "Límites declarados y nunca aplicados", revisada:** `maxUploadBytes` y `maxMaterials` ya se
    aplican de verdad (`api/materials.ts:27-28` vía `HttpApiSchema.asMultipart`;
    `file-material-repository.ts:208`, con test F4-04). Veredicto: **resueltos**, ya no son huecos.
    `maxPastedCharactersPerTurn` sigue en 0 usos fuera de `limits.ts`: sigue siendo correcto, no un
    hueco, porque el `@` manual que le daría un caso de uso quedó fuera de alcance de la fase 4
    (decisión 1); documentado como no aplicable, no como pendiente.
  - **§4.2, techos de salida por camino:** las seis capas de producción (`tutor`, `indexing`, `note`,
    `quiz`, `test`, `judge`) están todas enrutadas de verdad en este mismo tramo (`server.ts`,
    `handlers.ts`). Veredicto: **hecho**.
  - **Los tres listados sin techo (invariante 11), confirmados con el código actual, no arreglados
    en este tramo:**
    - `artifacts show` de un `quiz` o un `test` (`artifact-commands.ts:108-109`): `JSON.stringify(artifact, null, 2)`
      entero, sin techo. Es el más grave de los tres: un Examen de 30 preguntas con enunciados,
      opciones, explicaciones y citas ronda 6.000-8.000 tokens en una sola respuesta, y ese texto se
      queda fijo en el historial del resto de la conversación (hasta que la degradación de imágenes lo
      toque, que no aplica a texto). Frente a `materials read`, que sí tiene techo
      (`maxIndexTextCharactersPerTurn`), esto es exactamente el hueco de la invariante 11 que el plan
      señala.
    - `artifacts attempts` sin argumento (`:255-271`): todos los intentos de todas las pruebas, sin
      techo. Impacto por ahora acotado (una línea corta por intento), pero sin techo formal si el
      histórico crece.
    - `artifacts list` sin filtro (`:201-217`): todos los artefactos, sin techo. Mismo perfil que
      `attempts`: una línea por artefacto, sin techo formal.
    - **No se ha añadido ningún límite nuevo en este tramo.** El paso 23 pide el barrido con veredicto,
      no la implementación; fijar un techo nuevo (p. ej. `maxArtifactJsonCharacters` o paginar
      `attempts`/`list`) es una decisión de producto (qué se corta y cómo se avisa) que le toca a Iván,
      no algo que este tramo decida por su cuenta. Los tres quedan reportados como hueco real y
      pendiente, no como "no aplica" (a diferencia de `maxPastedCharactersPerTurn`, arriba).

## 2026-09-01 · Fase 4 · cierre, arreglos de la revisión de `@fiel-al-plan`

`@fiel-al-plan` contra `notes/plans/fase4-el-agente.md` dio veredicto ⚠️ DERIVA: cinco hallazgos, uno
ALTO. Cuatro se cierran en esta pasada; uno se aplaza a propósito.

- **`finishReason` ahora se lee en producción (F4-37, riesgo 10).** `assessment-generation-service.ts`
  y `note-generation-service.ts` registran con `Effect.logWarning` cuando una llamada se corta por el
  techo de salida (`finishReason: "length"`) y lo nombran en el mensaje de error o en el propio bloque,
  en vez de dejar que se confunda con "el tema no daba" o con un apunte sin más. Antes solo lo leían
  las evals.
- **`Chat.tsx` sigue volcando el `result` crudo en un `<pre>` (megas de base64 posibles): aplazado a
  propósito, no arreglado.** Decisión de Iván al revisar los hallazgos: se aborda con el rediseño de
  la vista de apuntes/chat ya anotado para después de cerrar las fases
  ([[rediseno-vista-apuntes]] en la memoria del agente), no como parche suelto ahora.
- **`docs/especificacion.md` sincronizado con ADR-025 y con la retirada de `TurnCost`.** F4-35 ya no
  dice que el Juez usa pensamiento extendido (lo tenía así desde antes de medir con las evals del
  tramo 4G, y el commit que "sincronizó la documentación" al cerrar 4G no lo tocó); ahora describe el
  mecanismo de medición, no un nivel fijo por suposición. F4-18/F4-19 dicen "registrar", no "mostrar":
  el coste del turno es dato de logs, nunca algo que el alumno vea en pantalla.
- **Subir un PDF ya no escribe nada hasta que el fichero está validado (nuevo, a petición de Iván,
  más allá de lo que pedía el plan original).** Al soltar o elegir ficheros en `UploadDropzone.tsx`,
  cada uno se manda solo (sin botón) a la nueva ruta `POST /api/materials/validate`, que corre el
  mismo sniff de cabecera + `pdfinfo` y la misma comprobación de nombre duplicado que `upload`, pero
  sin escribir a disco (`MaterialRepository.validate`, `checkCandidate` factorizado de `upload` en
  `file-material-repository.ts`). Un rechazo se avisa con su motivo y una X para quitarlo; la X está
  disponible en cualquier fichero de la zona, no solo en los rechazados (un PDF válido que ya no se
  quiera subir también se puede quitar). El botón "Subir N ficheros" solo se habilita cuando no queda
  ningún fichero en `validating` ni `rejected`. La ruta nueva va en `CLOSED_ROUTES` de
  `exam-lockdown.ts`, igual que `upload`, y no cuenta contra `uploadsPerWindow` (decisión 4: ese techo
  es de subidas reales, no de comprobaciones). Probado a mano en el navegador por Iván: PDF válido,
  fichero no-PDF, y el mismo nombre repetido en dos lotes.
- **El contrato de errores de `upload` en `packages/shared` (hallazgo 5, no literal al plan) se deja
  como está.** Ya estaba resuelto con criterio y documentado antes de esta pasada
  (`UnsupportedFileType`/`MaterialAlreadyExists` viajan en el 200, no como error HTTP, para que un
  fichero inválido no tumbe el resto del lote); no hacía falta tocar nada, solo constaba en el informe
  del agente.
- **El caso real de tres follow-ups sin delimitador de cierre se recupera, no se pierde.** La sesión
  observada traía `<<<FOLLOW-UP>>>` y exactamente tres preguntas válidas hasta EOF, pero no
  `<<<END FOLLOW-UP>>>`; el extractor anterior dejaba todo el sufijo como texto y Streamdown ocultaba
  parcialmente los marcadores como si fueran tags. El primer arreglo garantizaba F4-30 recortando el
  sufijo, pero también descartaba las tres preguntas. El cierre definitivo distingue formato de
  contenido: recupera esas mismas tres cuando solo falta el cierre. La misma sesión descubrió que dos
  medían 125 y 165 caracteres frente a un techo de 120 que el prompt no comunicaba. El techo explícito
  pasa a 200 y se incluye en el system prompt; una pregunta de 201 sigue invalidando el bloque entero.
  Ante dos preguntas, una línea extra, una pregunta fuera de techo o un cierre deformado devuelve cero.
  Nunca recorta, completa ni inventa.
- **Revisión posible de fase 5, no bloquea el cierre: la prevalidación solo ve el último FileList.**
  Dos nombres iguales dentro de una misma selección se detectan, pero si se añade `tema.pdf`, termina
  su validación y después se añade otro `tema.pdf`, las dos llamadas comprueban lotes separados y las
  dos filas pueden quedar como válidas. Por el mismo camino se pueden acumular más de
  `maxFilesPerUpload` ficheros mediante selecciones sucesivas. `upload` vuelve a validar y rechaza en
  voz alta, así que no hay sobrescritura, pérdida de datos ni rotura de la aplicación. Se acepta como
  borde de UX para cerrar fase 4 y se mueve al último nivel de prioridad de fase 5: si hay tiempo, se
  revalida toda la cola staged cada vez que se añadan ficheros, se invalidan respuestas asíncronas
  antiguas y se prueban duplicado y techo repartidos entre dos selecciones.

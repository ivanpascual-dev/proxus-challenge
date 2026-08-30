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

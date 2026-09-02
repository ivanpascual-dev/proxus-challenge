# Fase 1 · El suelo

> Plan de la fase. Lo que aquí queda decidido **no se vuelve a decidir al implementarlo**. Si el plan
> choca con la realidad, se avisa y se cambia el plan; no se improvisa una tercera cosa.
>
> Alcance de la fase: [`notes/hoja-de-ruta.md`](../hoja-de-ruta.md), apartado "Fase 1".
> Criterios EARS: [`docs/especificacion.md`](../../docs/especificacion.md), apartado "Fase 1".

---

## 1. Contexto

Sin índice por página, ningún bloque, cita ni pregunta puede decir de qué página salió, y el modelo
relee el PDF entero en cada turno. Sin techos declarados, `materials view apuntes 1-1000` renderiza mil
páginas y las manda todas, y `maxSteps` lo elige el cliente. Sin tokens de tema, cada pieza de interfaz
que se construya después nace con colores literales y hay que reescribirla al añadir el modo claro.

### El dato que gobierna el diseño

**Medido el 2026-08-28 sobre los 9 PDFs de `packages/server/.data/materials/pdfs` (294 páginas), con
`pdftotext` página a página, contando caracteres no blancos:**

| Familia | PDFs | Páginas | Media por página | Página más pobre | Página más rica |
| --- | --- | --- | --- | --- | --- |
| Diapositivas 16:9 (1920×1080 pt) | 6 | 261 | 76 a 145 | 0 | **541** |
| A4 de texto corrido (595×842 pt) | 3 | 33 | 2.157 a 2.458 | **853** | 3.029 |

**Entre 541 y 853 caracteres no hay ni una sola página del corpus.** El corpus es bimodal, que es
exactamente lo que predijo el ADR-001, y ese hueco es de donde sale el umbral: no se elige a ojo.

**Segunda medición, la del renderizado.** Gemini trocea cada imagen en tiles de 768 px con unidad de
recorte `floor(lado_corto / 1.5)` y cobra 258 tokens por tile, así que **el número de tiles depende de
la relación de aspecto, no del número de píxeles**. Una página 16:9 son 6 tiles tanto a 3840×2160 como
a 2048×1152. Por encima de lado corto 1152 px, los píxeles extra se descartan antes de llegar al
modelo. Medido con `pdftoppm`:

| Regla | Diapositiva 16:9 | A4 |
| --- | --- | --- |
| `-r 144` (lo que hace hoy [`poppler-pdf-service.ts:41`](../../packages/server/src/infra/materials/poppler-pdf-service.ts#L41)) | 344 KB, 3840×2160 | 362 KB, 1191×1684 |
| `-scale-to 2048` | 149 KB | 464 KB (sube) |
| **Lado corto a 1152 px** | **149 KB**, 2048×1152 | **352 KB**, 1152×1630 |

Un dpi fijo produce imágenes de tamaño radicalmente distinto según el tamaño físico de la página. El
lado corto a 1152 px es una sola regla que sirve para las dos formas, ahorra el 57% en diapositivas y
deja el A4 igual, con el mismo coste en tokens y sin perder un píxel de lo que el modelo ve.

**Tercera medición, el techo real de la API.** La documentación de Gemini fija **20 MB por petición**
contando texto, instrucciones e `inlineData`. Con la regla del lado corto, el caso más pesado medido
(20 páginas A4) son **9,4 MB ya en base64**, así que los 8 MB que el ADR-007 dejó marcados como
supuesto se quedan cortos y suben a 12 MB. Sigue habiendo 8 MB de holgura hasta el techo de la API.

---

## 2. Decisiones cerradas (no volver a preguntar)

1. **La fase se construye entera, en dos tramos dentro de este plan.** El tramo 1A (límites, barreras,
   presupuesto, tests, tema) se puede probar y cerrar solo; el tramo 1B (índice y visor de página) va
   encima. Motivo: hay un punto intermedio donde algo funciona de verdad, en vez de siete piezas a
   medias hasta el final.
2. **El umbral de densidad son 600 caracteres no blancos por página.** Motivo: cae en mitad del hueco
   medido (541 → 853), con margen por los dos lados, y sale de una medición reproducible.
3. **El renderizado usa lado corto a 1152 px, no un dpi fijo.** En dpi es `82944 / lado_corto_en_puntos`
   (77 para una diapositiva, 139 para un A4). Motivo: 1152 px da recortes de 768 px exactos, que es lo
   que Gemini consume 1:1; por encima se pagan bytes que el modelo descarta.
4. **El techo de bytes de imagen por turno sube de 8 MB a 12 MB, contando la cadena base64.** Motivo:
   se cuenta lo que viaja de verdad, y 12 MB deja que mande el techo de 20 páginas en el caso normal en
   vez de cortar casi siempre. El ADR-007 se corrige con esta cifra medida.
5. **Un material se indexa de dos formas: `pnpm index:materials` para el barrido, y bajo demanda la
   primera vez que se necesita, con estado visible.** Motivo: el barrido explícito hace el coste
   predecible; la carga perezosa evita que subir un PDF (fase 4) exija acordarse de nada.
6. **El índice guarda temas, y se producen en una sola llamada por material al terminar de indexarlo,
   sobre el texto ya indexado de todas sus páginas.** Motivo: una llamada por material, no por página,
   así que no se pierde el ahorro del camino de extracción. La fase 3 se encuentra el índice listo y no
   tiene que volver a pasar el modelo por 294 páginas.
7. **El fixture de calibración es sintético y se versiona en `packages/server/fixtures/materials/`.**
   Motivo: los 9 PDFs locales son material de cursos reales y [`docs/data.md:87`](../../docs/data.md)
   prohíbe subirlos. El fixture tiene páginas de los dos tipos para que los tests del umbral se puedan
   ejecutar en cualquier clon del repo.
8. **La paleta es la de la web de Proxus, y la tipografía es Montserrat.** Púrpura `#793EF9`, magenta
   `#9900A1`, acento suave `#EAD9FF`, éxito `#22C55E`, error `#EF4444`, aviso `#FF9800`, neutros de la
   escala gray de Tailwind. Los valores literales están en la sección 6.
9. **El agujero del `tool-result` fabricado por el cliente (check D3 de la batería) NO se cierra en esta
   fase.** Se cierra en la fase 4 con la sesión en servidor, como dice el ADR-008. Motivo: el atajo de
   restringir los roles aceptados dejaría al modelo sin el contexto de lo que devolvieron las
   herramientas en turnos anteriores, y hoy [`Chat.tsx:36-40`](../../packages/web/src/components/Chat.tsx#L36-L40)
   reenvía ese historial completo. D3 seguirá fallando y la batería lo enseñará, que es información
   honesta y no un agujero tapado.
10. **Los tests van con `node:test` sobre Node 24, sin `tsx` obligatorio.** Comprobado: `node --test`
    ejecuta ficheros `.ts` de este repo, con imports de `effect` incluidos, sin transpilador. Se usa
    `node --import tsx --test` de todos modos, por consistencia con el resto de scripts del repo.
11. **El índice se archiva por `sha256` del PDF; el `materialId` sigue saliendo del nombre del fichero**
    (ADR-011). Motivo: ese id viaja dentro de cada cita de la fase 2 y de la fase 3, así que no puede
    cambiar porque se edite el PDF; el índice, en cambio, sí debe seguir al contenido. **No existe el
    estado "índice caducado"**: o hay un índice para este contenido exacto, o hay que construirlo.
    Medido: `sha256` sobre los 19,6 MB del corpus tarda 10-50 ms, frente a los 380 ms de contar
    caracteres con `pdftotext`, y además detecta cambios que contar caracteres no ve (una imagen
    sustituida, páginas reordenadas).

### Asunciones marcadas (no las he verificado con Iván, y son reversibles)

- **A1.** Montserrat se carga desde Google Fonts con una pila de sistema como respaldo, y **VT323 no se
  usa**: es un acento retro y esta pantalla es una herramienta de estudio. Revertir es cambiar dos
  líneas del CSS.
- **A2.** El identificador de cliente del limitador de frecuencia es la IP de la petición. Sin
  autenticación no hay nada mejor, y el ADR-007 ya dice que esto es un fusible y no una cerradura.
- **A3.** La concurrencia de indexación es 4 páginas a la vez. Con 261 páginas de diapositivas a ~4 s
  por página, eso son unos 4,5 minutos de barrido completo.

---

## 3. Estado de partida verificado

Todo lo de aquí lo he leído en el código, no en los documentos.

| Qué | Dónde | Estado real |
| --- | --- | --- |
| `maxSteps` sin techo | [`tutor-chat-service.ts:33`](../../packages/server/src/domain/agents/academic-tutor/tutor-chat-service.ts#L33) y [`session.ts:80`](../../packages/server/src/domain/agents/harness/session.ts#L80) | `input.maxSteps ?? 8` en los dos sitios: valor por defecto, no techo |
| `maxSteps` en el contrato | [`shared/src/api/tutor.ts:8`](../../packages/shared/src/api/tutor.ts#L8) | `Schema.optional(Schema.Number)`, sin refinamiento |
| `messages` sin longitud máxima | [`shared/src/api/tutor.ts:6`](../../packages/shared/src/api/tutor.ts#L6) | `Schema.Array(AgentMessage)` a secas |
| `input` sin longitud máxima | [`shared/src/api/tutor.ts:7`](../../packages/shared/src/api/tutor.ts#L7) | `Schema.String` a secas |
| Selección de páginas sin techo | [`material.ts:49-81`](../../packages/server/src/domain/materials/material.ts#L49-L81) | Valida entero positivo y rango no invertido. Nada más |
| Endpoint de página | [`shared/src/api/materials.ts`](../../packages/shared/src/api/materials.ts) | **No existe.** Solo `list` y `get` |
| `limits.ts` | `packages/shared/src/` | **No existe** |
| `domain/limits/` | `packages/server/src/domain/` | **No existe** |
| Extracción de texto | [`pdf-service.ts:8-15`](../../packages/server/src/domain/materials/pdf-service.ts#L8-L15) | El puerto solo tiene `pageCount` y `renderPage`. No hay `extractText` |
| Renderizado | [`poppler-pdf-service.ts:41`](../../packages/server/src/infra/materials/poppler-pdf-service.ts#L41) | `dpi = 144` fijo, PNG, devuelve data URL base64 |
| `orDie` en el transporte | [`handlers.ts`](../../packages/server/src/transport/http/handlers.ts) | Seis, uno por handler (14, 29, 31, 50, 52, 58). ADR-005 |
| Batería de guardarraíles | [`scripts/test-guardarrailes.mjs:26-38`](../../scripts/test-guardarrailes.mjs#L26-L38) | **Ya existe** y ya importa `LIMITS` de `@proxus/shared`, con respaldo mientras no exista. Espera `maxAgentSteps`, `maxMessageCharacters` y `maxHistoryMessages`, y **400** en los checks D2, D4 y D5 |
| Colores literales en la web | `App.tsx` + `components/*.tsx` | **138 ocurrencias**, no las 77 que dice la hoja de ruta: ArtifactWorkspace 66, Sidebar 38, Chat 34, App 2. 51 clases distintas |
| Tema | [`styles.input.css:8`](../../packages/web/src/styles.input.css#L8) | `color-scheme: dark` clavado, sin bloque `@theme`, sin tokens |
| Tests | todo el repo | Cero. `*.test.ts` solo aparece dentro de `node_modules` |
| Parte de fichero en el adaptador | [`gemini.ts:82-100`](../../packages/server/src/domain/agents/gemini.ts#L82-L100) | Convierte `type: "file"` a `inlineData` y quita el prefijo del data URL. **Sirve tal cual para la indexación**, no hace falta adaptador nuevo |
| Salida JSON del adaptador | [`gemini.ts`](../../packages/server/src/domain/agents/gemini.ts) | **No manda `generationConfig`**, así que no hay modo JSON. La respuesta del modelo se parsea a mano y el fallo se declara |

### Comprobaciones de entorno hechas

- `node -v` → **v24.16.0**. `pnpm -v` → 10.23.0.
- `node --test packages/shared/src/*.test.ts` con un fichero que importa `effect`: **pasa**, sin `tsx`.
- `node --import tsx --test "packages/*/src/**/*.test.ts"`: el glob **descubre** los tests de todos los
  paquetes.
- `pnpm --filter @proxus/shared run typecheck` con un `*.test.ts` dentro de `src`: **pasa**. El
  `include: ["src/**/*.ts"]` del tsconfig ya los coge y `@types/node` resuelve `node:test`.
- `pdftotext` **está instalado** junto a `pdfinfo` y `pdftoppm`.
- `pdftoppm` soporta `-scale-to`, `-scale-to-x` y `-scale-to-y`. Con `-1` en la otra dimensión mantiene
  la relación de aspecto.
- Un fallo de esquema en la petición de un endpoint de Effect HttpApi se renderiza como **400 con
  cuerpo vacío** (`HttpApiError.js:399` y `405-421`). Eso es un 400 mudo, y la invariante 11 exige que
  el rechazo diga por qué: por eso el techo **no** se pone como refinamiento de esquema (ver sección 4).
- Los refinamientos de Effect 4 beta son `Schema.isMaxLength(n)`, `Schema.isMinLength(n)`,
  `Schema.isLessThanOrEqualTo(n)`, `Schema.isGreaterThanOrEqualTo(n)` y `Schema.Int`, aplicados con
  `.check(...)`. Verificado en el `.d.ts` de `effect@4.0.0-beta.83`, no de memoria.
- `HttpApiEndpoint.post(...)` acepta un campo `error` en su tercer argumento. Ahí van los errores
  declarados del ADR-005.

---

## 4. Qué se construye, pieza a pieza

### Tramo 1A · Los techos, el presupuesto, los tests y el tema

#### 4.1 `packages/shared/src/limits.ts` — puro, testeable

Un único objeto `LIMITS`, congelado, con las cuatro familias del ADR-007. **Nombres obligados por la
batería** (`test-guardarrailes.mjs:33-37`): `maxAgentSteps`, `maxMessageCharacters`, `maxHistoryMessages`.

```ts
export const LIMITS = {
  // Tamaño de entrada
  maxMessageCharacters: 2_000,
  maxPastedCharactersPerTurn: 12_000,
  maxHistoryMessages: 400,
  maxHistoryCharacters: 200_000,
  maxBlockCharacters: 5_000,
  maxUploadBytes: 25 * 1024 * 1024,

  // Coste por turno
  maxPagesPerTurn: 20,
  maxTurnImageBytes: 12 * 1024 * 1024,   // base64, medido en la fase 1
  maxAgentSteps: 8,

  // Frecuencia
  messagesPerWindow: { limit: 20, windowMs: 10 * 60 * 1000 },
  messagesPerDay: { limit: 200, windowMs: 24 * 60 * 60 * 1000 },
  artifactsPerWindow: { limit: 5, windowMs: 10 * 60 * 1000 },
  artifactsPerDay: { limit: 40, windowMs: 24 * 60 * 60 * 1000 },
  maxConcurrentRequests: 3,

  // Tamaño de salida
  maxQuestionsPerArtifact: 50,
  maxBlocksPerNote: 200,
  maxTopicsPerMaterial: 40,
  maxTopicsPerPage: 3,
  maxIndexedCharactersPerPage: 8_000,

  // Tiempo
  modelCallTimeoutMs: 60_000,
  externalFetchTimeoutMs: 5_000,
  maxExternalFetchBytes: 2 * 1024 * 1024,

  // Indexado y renderizado
  textDensityThreshold: 600,             // caracteres no blancos, calibrado 2026-08-28
  renderShortSidePixels: 1_152,
  indexConcurrency: 4
} as const;
```

Se exporta desde `packages/shared/src/index.ts`. **Ese fichero es el único domicilio de las cifras**;
`docs/decisiones.md` (ADR-007) queda subordinado a él, como el propio registro dice.

#### 4.2 `packages/shared/src/errors/limit-exceeded.ts` — el error declarado

**Por qué no se ponen los techos como refinamiento del esquema**, aunque sería más corto: comprobado
que un fallo de esquema da un 400 **con cuerpo vacío**, y la invariante 11 exige que el rechazo diga
qué techo se cruzó y con qué valor. Un 400 mudo no es "refused out loud".

```ts
export class LimitExceeded extends Schema.ErrorClass<LimitExceeded>("LimitExceeded")({
  _tag: Schema.tag("LimitExceeded"),
  limit: Schema.String,        // la clave de LIMITS: "maxMessageCharacters"
  ceiling: Schema.Number,
  received: Schema.Number,
  message: Schema.String       // en español, para la interfaz
}) {}
```

Se declara en el campo `error` de los endpoints que lo pueden lanzar y se mapea a **400** en el handler
(**429** en el caso de los límites de frecuencia, que llevan su propio `RateLimited` con `retryAfterMs`).

> La forma exacta de `Schema.ErrorClass` en `effect@4.0.0-beta.83` se comprueba en el `.d.ts` antes de
> escribirla. Si no existe con ese nombre, se usa `Schema.TaggedError` y se ajusta; **lo que no se
> negocia son los campos**, porque son lo que la interfaz necesita para pintar el mensaje.

#### 4.3 Las tres barreras deterministas

Todas en el servidor, todas contra `LIMITS`, todas devolviendo `LimitExceeded` mapeado a 400.

| Barrera | Dónde se impone | Comportamiento |
| --- | --- | --- |
| `maxSteps` acotado | `tutor-chat-service.ts:30-34` | Si `input.maxSteps > LIMITS.maxAgentSteps`, **se rechaza**, no se recorta. Si no llega, se usa el techo. **`session.ts:80` también deja de tener `?? 8`**: recibe el valor ya acotado |
| Longitud del historial | Validación de la petición del chat | `messages.length > maxHistoryMessages` o suma de caracteres `> maxHistoryCharacters` → rechazo |
| Longitud del mensaje | Validación de la petición del chat | `input.length > maxMessageCharacters` → rechazo |

**Las tres se imponen en una sola función pura**, `checkChatRequestLimits(request): Option<LimitExceeded>`,
en `packages/server/src/domain/limits/chat-limits.ts`. **La llaman los dos caminos**: el handler de
`POST /api/tutor/chat` y la ruta NDJSON manual de [`server.ts:30`](../../packages/server/src/transport/http/server.ts#L30).
Si solo la llama uno, el otro es el agujero.

#### 4.4 Techo de selección de páginas

En `parsePageSelection` ([`material.ts:49`](../../packages/server/src/domain/materials/material.ts#L49)),
que es el único sitio del repo donde se parsea una selección de páginas. Si el resultado tiene más de
`LIMITS.maxPagesPerTurn` entradas, **falla nombrando el techo y el número pedido, y no renderiza
ninguna**. Nada de servir las 20 primeras.

#### 4.5 Presupuesto por turno — puro por dentro, con estado por fuera

`packages/server/src/domain/limits/turn-budget.ts`. Un turno es **un mensaje del usuario y todo el
trabajo que desencadena**, así que el presupuesto se crea al empezar la petición de chat y muere con
ella.

```ts
export interface TurnBudgetState {
  readonly pagesLeft: number;
  readonly bytesLeft: number;
}

// Puro y testeable. Decide cuántas páginas de la lista caben y qué aviso hay que dar.
export const planRender: (
  state: TurnBudgetState,
  pageSizes: readonly number[]   // bytes base64 de cada página pedida, en orden
) => {
  readonly served: number;        // cuántas se sirven
  readonly nextState: TurnBudgetState;
  readonly notice: string | null; // "Me detuve en la página 14 de 20: las imágenes llegaron a 12 MB."
};
```

**Los bytes se acumulan mientras se renderiza**, así que `planRender` no puede conocer los tamaños de
antemano. La versión real es incremental: se renderiza una página, se le pregunta al presupuesto si
cabe, y si no cabe **se para y se devuelve lo que hay con el aviso dentro del resultado**, para que el
modelo lo lea. No es recorte silencioso porque el aviso viaja con los datos.

**Cómo llega el presupuesto al comando `materials view`.** El harness se construye hoy una sola vez, en
[`tutor-chat-service.ts:27`](../../packages/server/src/domain/agents/academic-tutor/tutor-chat-service.ts#L27).
**Pasa a construirse una vez por petición**, con un `Ref` de presupuesto fresco que se le pasa a
`makeMaterialCommands`. Construir el harness es declarar comandos: es barato. Es la versión aburrida y
se explica en una frase, que es el criterio que manda.

#### 4.6 Contador con estado: frecuencia y concurrencia

`packages/server/src/domain/limits/rate-limiter.ts`. Ventana deslizante en memoria, **con el reloj
inyectado** (`now: () => number`), porque si no los tests tienen que dormir y entonces no se escriben.

```ts
export interface RateLimiter {
  readonly check: (key: string, family: "messages" | "artifacts") => Effect.Effect<void, RateLimited>;
  readonly acquire: (key: string) => Effect.Effect<void, RateLimited>;  // concurrencia
  readonly release: (key: string) => Effect.Effect<void>;
}
```

Clave del cliente: la IP (asunción A2). Se aplica en el transporte, a `POST /api/tutor/chat`, a la ruta
NDJSON y a la creación de artefactos. Devuelve **429** con `retryAfterMs`, que es lo que la batería ya
sabe leer (`test-guardarrailes.mjs:228`).

#### 4.7 Andamio de tests

- Ficheros `*.test.ts` **junto al código que prueban**, dentro de `src/`. Ya están en el `include` del
  tsconfig, así que el typecheck los cubre. Comprobado.
- Script raíz: `"test": "node --import tsx --test \"packages/*/src/**/*.test.ts\""`.
- Casos de esta fase, elegidos por dónde el error es silencioso (ADR-009):
  - `parsePageSelection`: rango invertido, cero, no entero, duplicados, orden de salida, y **justo 20 y
    justo 21 páginas**.
  - `checkChatRequestLimits`: cada uno de los tres techos justo por debajo y justo por encima.
  - `planRender`: presupuesto de páginas agotado, presupuesto de bytes agotado a mitad de lista (y que
    el aviso nombre la página correcta), y el caso de que la primera página ya no quepa.
  - `RateLimiter`: ventana que se llena, ventana que libera al avanzar el reloj inyectado, y
    concurrencia que rechaza la cuarta petición y la vuelve a admitir tras `release`.
  - `classifyPage` (sección 4.9): 599 y 601 caracteres.
  - `renderScale`: que `82944 / 1080 ≈ 77` y `82944 / 595 ≈ 139`, y que el lado corto resultante sea
    1152 en las dos formas.

#### 4.8 Tokens de tema y sustitución de los colores literales

- `styles.input.css`: bloque `@theme` con los tokens semánticos (Tailwind v4, la configuración vive en
  el CSS). Los valores literales están en la sección 6.
- **Se quita `color-scheme: dark` clavado** ([`styles.input.css:8`](../../packages/web/src/styles.input.css#L8)).
  El control del tema tiene **tres estados: sistema (por defecto), claro y oscuro**, y la elección
  persiste en `localStorage`. "Sistema" sigue a `prefers-color-scheme` **en vivo** (un cambio de tema
  del SO se aplica sin recargar); "claro" y "oscuro" son una elección explícita que ni el SO ni una
  recarga pisan.
  > **Actualizado sobre la marcha (2026-08-28).** El plan original decía un conmutador binario. En la
  > verificación se vio que, tras el primer clic, `localStorage` guardaba `"light"` o `"dark"` para
  > siempre y F1-21 ("y el usuario no haya elegido tema") ya no se podía volver a cumplir: el tema del
  > SO quedaba ignorado. El tercer estado, "sistema", es el que hace que F1-21 sea reversible.
- **Las 138 ocurrencias de color literal se sustituyen por tokens.** Ni una `slate-800` suelta queda en
  los componentes. Ese es el criterio de "hecho", y es verificable con el mismo `grep` de la sección 3.
- Contraste AA comprobado a mano en los dos temas para texto sobre fondo, texto sobre superficie y
  texto sobre el púrpura de acento.

---

### Tramo 1B · El índice y el visor de página

#### 4.9 Clasificación de página — pura, testeable

`packages/server/src/domain/materials/page-classifier.ts`.

```ts
export type PageProvenance = "extracted" | "transcribed";

// Cuenta caracteres NO BLANCOS, que es como se calibró el umbral.
export const countDenseCharacters = (text: string): number => text.replace(/\s/g, "").length;

export const classifyPage = (extractedText: string): PageProvenance =>
  countDenseCharacters(extractedText) >= LIMITS.textDensityThreshold ? "extracted" : "transcribed";
```

#### 4.10 Escala de renderizado — pura, testeable

`packages/server/src/domain/materials/render-scale.ts`.

```ts
// Gemini recorta en tiles con unidad floor(lado_corto / 1.5) y los consume a 768 px.
// Lado corto a 1152 px => recortes de 768 px exactos, 1:1, sin píxeles descartados.
export const renderDpi = (shortSidePoints: number): number =>
  Math.round((LIMITS.renderShortSidePixels * 72) / shortSidePoints);
```

`poppler-pdf-service.ts` deja de usar `dpi = 144`: lee el tamaño de página de `pdfinfo` (que ya llama) y
renderiza con `-scale-to-x 1152 -scale-to-y -1` o `-scale-to-y 1152 -scale-to-x -1` según cuál sea el
lado corto. **Sigue siendo PNG**: el JPEG ahorraría un 23% en A4 metiendo artefactos justo en lo que hay
que leer.

#### 4.11 `PdfService.extractText`

Se añade al puerto ([`pdf-service.ts:8`](../../packages/server/src/domain/materials/pdf-service.ts#L8)):

```ts
readonly extractText: (input: { readonly path: string; readonly page: number })
  => Effect.Effect<string, PdfServiceError>;
```

El adaptador lo implementa con `pdftotext -f N -l N <pdf> -`. **`pdftotext` pasa a ser un tercer binario
requerido al arrancar**, junto a `pdfinfo` y `pdftoppm`, con el mismo `assertExecutable` que ya existe
([`poppler-pdf-service.ts:11-26`](../../packages/server/src/infra/materials/poppler-pdf-service.ts#L11-L26)).
Fallar al arrancar es deliberado y no se convierte en un aviso. **Hay que actualizar
[`AGENTS.md:36`](../../AGENTS.md), `docs/getting-started.md` y `docs/data.md`**, que hoy nombran solo
dos.

#### 4.12 El índice: modelo, puerto y adaptador

**Modelo** en `packages/shared/src/schemas/material-index.ts`, porque viaja por HTTP:

```ts
MaterialTopic      = { id: string; label: string; pages: readonly number[] }
IndexedPage        = { page: number; provenance: "extracted" | "transcribed"; text: string;
                       denseCharacters: number; topicIds: readonly string[] }
UnindexedPage      = { page: number; reason: string }
// Lo que se GUARDA. Archivado por contenido, así que solo contiene lo que se deriva del contenido.
// Nada de materialId ni fileName: dos ficheros con distinto nombre pueden tener el mismo contenido,
// y guardar aquí el nombre del primero hace que el segundo herede una identidad que no es la suya.
MaterialIndexContent = { contentHash: string;   // sha256 del PDF, ADR-011
                         pageCount: number; indexedAt: string; threshold: number;
                         topics: readonly MaterialTopic[];
                         pages: readonly IndexedPage[];
                         failedPages: readonly UnindexedPage[] }

// Lo que se DEVUELVE. El contenido más la identidad, resuelta en el momento de leer contra el fichero
// que hoy tiene esa huella.
MaterialIndex        = MaterialIndexContent & { materialId: string; fileName: string }
```

**`failedPages` existe a propósito.** La invariante 3 prohíbe el fallo silencioso: una página que no se
pudo indexar se guarda con su motivo, **nunca como texto vacío**, porque texto vacío es
indistinguible de una página en blanco.

**Puerto** `MaterialIndexRepository` en `domain/materials/`, con `getByHash`, `put` y `prune`.
**Adaptador** `FileMaterialIndexRepository` en `infra/materials/`, archivando en
`.data/materials/index/<sha256>.json`, copiando el molde `make(directory)` / `layer(directory)` que dice
el `CLAUDE.md` del paquete.

**Validez del índice (ADR-011): no hay validez, hay presencia.** Se calcula el `sha256` del PDF y se
busca ese fichero. Si está, el índice es de este contenido exacto por construcción. Si no está, hay que
indexar. **No existe el estado "caducado"** y por tanto no existe el fallo de servir un índice viejo.

La huella se calcula con `node:crypto` sobre los bytes del fichero. **También dentro de `list()`**, y
está medido: esa función ya lanza un `pdfinfo` por fichero en cada llamada
([`file-material-repository.ts:46`](../../packages/server/src/infra/materials/file-material-repository.ts#L46)),
que cuesta **90-210 ms** sobre los 9 PDFs, mientras que el `sha256` de los mismos ficheros cuesta
**10-40 ms**. Es entre 5 y 9 veces más barato que lo que ya se paga ahí.

Eso hace que `list()` pueda decir en una sola pasada qué materiales están indexados, que es lo que
necesita el criterio F1-16 para no obligar a la barra lateral a una segunda petición por material.
**`PdfMaterial` gana un campo `indexState: "indexed" | "not-indexed"`** en `packages/shared`.

`prune` borra los índices cuya huella ya no corresponde a ningún PDF presente. **Es explícito
(`pnpm index:materials --prune`), nunca automático:** un índice huérfano vuelve a servir si se deshace
la edición del PDF (un `git checkout`, una copia restaurada), porque vuelve el hash viejo y el índice
sigue intacto. Borrarlo por defecto sería tirar un reindexado ya pagado.

#### 4.13 El servicio de indexación

`domain/materials/indexing-service.ts`. Por cada página, en orden, con concurrencia
`LIMITS.indexConcurrency`:

1. `pdf.extractText(page)`.
2. `classifyPage(texto)`.
3. Si es `extracted`, se guarda ese texto, truncado a `maxIndexedCharactersPerPage`. Cero llamadas al
   modelo.
4. Si es `transcribed`, se renderiza la página y se manda al modelo con el prompt literal de la sección
   6. Se parsea el JSON de la respuesta; **si no parsea, la página va a `failedPages` con el motivo**,
   no a texto vacío.
5. Al terminar todas las páginas, **una sola llamada** con el prompt de temas de la sección 6 sobre el
   texto indexado completo. El resultado rellena `topics` y los `topicIds` de cada página.

**Progreso observable**: el servicio emite eventos de progreso (`página N de M`, camino usado) que el
script imprime y que la interfaz muestra mientras el material esté indexándose.

#### 4.14 Los endpoints nuevos

> **Actualizado sobre la marcha (2026-08-28).** Al construir el tramo 1B salieron dos cambios, los dos
> documentados en [`notes/bitacora.md`](../bitacora.md):
>
> 1. Se añade un **tercer endpoint**, `POST /materials/:id/index` (ruta NDJSON manual, mismo patrón que
>    el stream del chat), para disparar la indexación desde la web con progreso página a página. Lo pide
>    el paso 22 y el criterio F1-16, y en la fase 4 la subida llamará a ese mismo endpoint. Su error
>    declarado es `MaterialIndexingFailed`.
> 2. `GET /materials/:id/pages/:page` devuelve **solo `PageImage`**, no `{ image, entry }`, y **no exige
>    índice** (se quita el 409): ver el PDF va antes de indexarlo (F1-17). La procedencia se sigue
>    viendo, pintada en la web a partir de `materialIndexQuery`. Se eliminan `getPageView`,
>    `MaterialPageView` y `MaterialPageEntry`.
> 3. `MaterialRepositoryError` (fallo de disco) se mapea a un `MaterialStorageError` **declarado**, 500
>    con cuerpo y motivo, en los handlers `index` y `page`: ningún `orDie` mudo en handler nuevo.

En `packages/shared/src/api/materials.ts`, **con sus errores declarados** (ADR-005, invariante 6: nada
de `orDie` en handlers nuevos):

| Endpoint | Devuelve | Errores declarados |
| --- | --- | --- |
| `GET /materials/:id/index` | `MaterialIndex` sin imágenes | `MaterialNotFound` (404), `MaterialNotIndexed` (409), `MaterialStorageError` (500) |
| `GET /materials/:id/pages/:page` | `PageImage` | `MaterialNotFound` (404), `PageOutOfRange` (400), `MaterialStorageError` (500) |
| `POST /materials/:id/index` (NDJSON) | stream de progreso, `MaterialIndex` al terminar | `MaterialNotFound` (404), `MaterialIndexingFailed` (500) |

El visor de página **no consume presupuesto de turno**: el presupuesto acota lo que gasta el agente, y
esto es una persona pulsando un botón. El techo que sí aplica es el de frecuencia.

#### 4.15 El visor en la web

> **Actualizado sobre la marcha (2026-08-28).** Tras probar el tramo 1B, Iván pidió el visor como
> **scroll continuo de todas las páginas** (como un PDF), en dos pestañas junto al mapa mental de temas,
> no una página suelta abierta desde una cita. La procedencia se muestra como **marca ámbar en la
> esquina** de las páginas transcritas y **banda roja** en las fallidas, no como texto indexado ni
> rejilla de puntos. La invariante 8 se mantiene: la imagen real está delante y lo transcrito por el
> modelo se señala. Contexto en [`notes/bitacora.md`](../bitacora.md).

Un atom nuevo en `domain/materials/atoms.ts`, siguiendo el patrón de `domain/artifacts/atoms.ts`, con
sus cuatro estados (cargando, vacío, error, con datos).

#### 4.16 El fixture sintético

`packages/server/fixtures/materials/densidad.pdf`, cuatro páginas generadas por
`packages/server/fixtures/make-fixture.mjs` (sin dependencias nuevas: PDF escrito a mano o con las
herramientas de Poppler ya presentes):

| Página | Contenido | Camino esperado |
| --- | --- | --- |
| 1 | Portada: un título de 30 caracteres | `transcribed` |
| 2 | Texto corrido de ~2.400 caracteres | `extracted` |
| 3 | Texto escaso de ~200 caracteres | `transcribed` |
| 4 | Texto de ~610 caracteres, justo por encima del umbral | `extracted` |

Se documenta en `docs/data.md` como fixture propio, generado, sin derechos de terceros.

---

## 5. Qué toca en `packages/shared`

**Va primero en el orden de ejecución**, porque es la pieza que rompe los dos lados a la vez y sus
errores de typecheck son el mapa de lo que hay que tocar.

| Fichero | Qué |
| --- | --- |
| `src/limits.ts` | **Nuevo.** El objeto `LIMITS` |
| `src/errors/limit-exceeded.ts` | **Nuevo.** `LimitExceeded` y `RateLimited` |
| `src/schemas/material-index.ts` | **Nuevo.** `MaterialIndex`, `MaterialTopic`, `IndexedPage`, `UnindexedPage` |
| `src/schemas/material.ts` | `PdfMaterial` gana `indexState: "indexed" \| "not-indexed"`, para que `list` diga de una pasada qué está indexado (ADR-011, criterio F1-16) |
| `src/api/materials.ts` | Se añaden `index` y `page`, con sus errores declarados |
| `src/api/tutor.ts` | Se declara `LimitExceeded` y `RateLimited` en el endpoint `chat`. **El esquema de `maxSteps`, `input` y `messages` NO cambia**: el techo se impone en el dominio para que el rechazo lleve mensaje |
| `src/index.ts` | Se exportan los tres ficheros nuevos |

---

## 6. Texto canónico literal

**Se copian tal cual. No se "mejoran" de estilo**: cada regla de aquí responde a una invariante.

### 6.1 Prompt de transcripción de página

```text
Eres un transcriptor de páginas de material académico. Recibes la imagen de UNA página de un PDF.

Devuelve SOLO un objeto JSON con esta forma exacta, sin texto antes ni después:
{"text": "...", "isBlank": false}

Reglas:
- `text` es la transcripción de todo lo legible en la página: títulos, párrafos, viñetas, código,
  rótulos de diagramas, texto dentro de imágenes y pies de figura, en el orden en que se leen.
- No traduzcas nada. Si la página dice `set`, escribes `set`. Si está en inglés, se queda en inglés.
- El código se transcribe literal, respetando indentación y saltos de línea, dentro de una valla ```.
- Lo que no se lea con seguridad se marca [ilegible]. No lo adivines.
- No resumas, no expliques y no añadas nada que no esté en la página.
- Si la página no tiene contenido legible (portada vacía, separador), `isBlank` es true y `text` es "".
```

> La regla de no traducir es la invariante 1 y es la que más se rompe sin querer. La de `[ilegible]` es
> la invariante 3: preferimos un hueco marcado a una invención plausible.

### 6.2 Prompt de temas del material

> **Actualizado sobre la marcha (2026-08-28).** Tras probar el tramo 1B, Iván pidió un mapa mental
> "con relaciones" en vez de una nube de etiquetas, así que el prompt pasa a pedir una jerarquía de
> dos niveles (`parent`). Contexto en [`notes/bitacora.md`](../bitacora.md) y ADR-012.

```text
Recibes el texto indexado de un material académico, página a página, con el número de página delante
de cada una.

Devuelve SOLO un objeto JSON con esta forma exacta, sin texto antes ni después:
{"topics": [{"id": "kebab-case", "label": "...", "pages": [1, 2, 5], "parent": null}]}

Reglas:
- Un tema es una unidad de estudio del material, no una palabra suelta. Entre 3 y {MAX_TOPICS} temas en total.
- `label` usa el vocabulario del propio material y no lo traduce. Si el material dice `set`, el tema se
  llama `set`, nunca "conjunto".
- `pages` son las páginas donde ese tema se trata de verdad, no donde se menciona de pasada.
- Toda página con contenido debe aparecer en al menos un tema. Si una página no encaja en ninguno, crea
  el tema que le corresponda.
- Organiza los temas en una jerarquía de como mucho dos niveles: unos pocos temas generales (las áreas
  del material) y, colgando de ellos, sus subtemas concretos. `parent` es el `id` de otro tema de esta
  misma lista, o null si el tema es de primer nivel.
- Entre 2 y 6 temas de primer nivel.
- Un subtema trata un aspecto de su tema padre, no algo distinto. Si dudas, ponlo como tema de primer nivel.
- No inventes temas ni relaciones que no aparezcan en el texto recibido.
```

### 6.3 Tokens de tema

Paleta de la web de Proxus. **Se define el juego claro en `:root` y el oscuro se deriva**; el claro es
el tema de la marca y el oscuro es el que la aplicación tiene hoy.

```css
@import "tailwindcss";
@import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap");

@theme {
  --font-sans: "Montserrat", ui-sans-serif, system-ui, sans-serif;

  /* Marca */
  --color-brand:            #793EF9;
  --color-brand-strong:     #9900A1;
  --color-brand-soft:       #EAD9FF;
  --color-on-brand:         #FFFFFF;

  /* Superficies, tema claro */
  --color-canvas:           #F8FAFC;
  --color-surface:          #FFFFFF;
  --color-surface-muted:    #F3F4F6;
  --color-border:           #E5E7EB;
  --color-border-strong:    #D1D5DB;

  /* Texto, tema claro */
  --color-heading:          #111827;
  --color-body:             #1F2937;
  --color-muted:            #6B7280;
  --color-disabled:         #9CA3AF;

  /* Semánticos */
  --color-success:          #22C55E;
  --color-danger:           #EF4444;
  --color-warning:          #FF9800;
  --color-accent-gold:      #D4AF37;
}

@layer base {
  :root { color-scheme: light; }

  :root[data-theme="dark"] {
    color-scheme: dark;
    --color-canvas:        #0B1020;
    --color-surface:       #131A2E;
    --color-surface-muted: #1B2439;
    --color-border:        #2A3350;
    --color-border-strong: #3A4665;
    --color-heading:       #F8FAFC;
    --color-body:          #E2E8F0;
    --color-muted:         #94A3B8;
    --color-disabled:      #64748B;
    --color-brand:         #A67CFF;
    --color-brand-soft:    #2B1E4D;
    --color-on-brand:      #0B1020;
  }
}
```

> El púrpura del tema oscuro es `#A67CFF` y no `#793EF9` porque el original sobre `#0B1020` no llega a
> 4,5:1. **La marca se conserva en el claro y se aclara en el oscuro**, que es lo que hace cualquier
> sistema de diseño serio. El valor exacto se ajusta midiendo el contraste, no a ojo.

---

## 7. Orden de ejecución

Ejecutable de arriba abajo. **Los tres checks del repo pasan al final de cada paso numerado**, no solo
al final de la fase.

### Tramo 1A

1. `packages/shared/src/limits.ts` y su export. Nada más. `pnpm run typecheck`.
2. **Los tests de `parsePageSelection` y de los límites, escritos antes que las barreras.** Tienen que
   **fallar**. Un test escrito después del arreglo prueba tu comprensión del bug, no el bug.
3. Script `pnpm test` en el `package.json` raíz.
4. `packages/shared/src/errors/limit-exceeded.ts` y su declaración en el endpoint `chat` de `tutor.ts`.
5. `domain/limits/chat-limits.ts` con `checkChatRequestLimits`, llamada **desde los dos caminos**: el
   handler de `chat` y la ruta NDJSON de `server.ts:30`. Los tests del paso 2 pasan.
6. `maxSteps` acotado: `tutor-chat-service.ts:33` deja de hacer `?? 8` y `session.ts:80` recibe el valor
   ya acotado.
7. Techo de páginas en `parsePageSelection`.
8. `domain/limits/turn-budget.ts` con `planRender` y sus tests. Harness construido por petición con
   presupuesto fresco; `makeMaterialCommands` lo consume y devuelve el aviso dentro del resultado.
9. `domain/limits/rate-limiter.ts` con reloj inyectado y sus tests. Aplicado en el transporte, 429 con
   `retryAfterMs`.
10. **Punto de control:** `pnpm dev` en una terminal, `pnpm test:guardarrailes` en otra. **D1, D2, D4 y
    D5 tienen que pasar. D3 falla a propósito** (decisión 9) y así se anota.
11. Bloque `@theme`, `color-scheme` fuera, control de tema con persistencia.
12. Sustitución de las 138 ocurrencias de color literal por tokens, componente a componente. Criterio de
    hecho: el `grep` de la sección 3 devuelve 0.
13. Contraste AA comprobado en los dos temas.

### Tramo 1B

14. `PdfService.extractText` en el puerto y en el adaptador, con `assertExecutable("pdftotext")`.
    Actualizar `AGENTS.md`, `docs/getting-started.md`, `docs/data.md` y **[`docs/notas-tecnicas.md:65`](../../docs/notas-tecnicas.md#L65),
    que hoy nombra dos binarios de Poppler y pasan a ser tres**.
15. `render-scale.ts` y `page-classifier.ts`, con sus tests. Puros, cero entrada/salida.
16. `poppler-pdf-service.ts` pasa de `-r 144` a lado corto 1152.
17. `packages/shared/src/schemas/material-index.ts` y su export.
18. Puerto `MaterialIndexRepository` y adaptador `FileMaterialIndexRepository`.
19. Fixture sintético y su generador. Tests del umbral contra el fixture. **Y el script `pnpm seed:demo`
    que copia `packages/server/fixtures/materials/*.pdf` a `.data/materials/pdfs/`**: hoy
    [`docs/notas-tecnicas.md:68`](../../docs/notas-tecnicas.md#L68) y [`docs/data.md:100`](../../docs/data.md) lo prometen los dos y
    no existe, así que el documento de entrega manda ejecutar un comando que falla.
20. `indexing-service.ts` con los dos prompts literales de la sección 6 y el parseo defensivo del JSON.
21. Script `pnpm index:materials` con progreso en consola, y su bandera `--prune` (explícita, nunca por
    defecto). **Se ejecuta contra los 9 PDFs reales y se anota lo que tardó y lo que costó.**
22. Indexado bajo demanda con estado observable.
23. Los dos endpoints nuevos, con errores declarados y mapeados (nada de `orDie`).
24. Visor de página en la web, con sus cuatro estados y la procedencia visible.
25. `docs/especificacion.md`, `docs/decisiones.md` (la cifra de 12 MB del ADR-007), `CHANGELOG.md` y
    `docs/notas-tecnicas.md` al día. **`docs/notas-tecnicas.md` no es trabajo del último día.**

---

## 8. Cómo se sabe que funciona

**Los criterios EARS de esta fase viven en [`docs/especificacion.md`](../../docs/especificacion.md),
apartado "Fase 1", del `F1-01` al `F1-24`.** Aquí va solo cómo se prueba cada uno.

### Los tres checks del repo

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

Más el cuarto, que esta fase estrena:

```bash
pnpm test
```

### Procedimiento por criterio

| Criterios | Cómo se prueban |
| --- | --- |
| `F1-01`, `F1-02`, `F1-03` | `pnpm dev` y `pnpm test:guardarrailes`. Son los checks **D2, D4 y D5** de la batería, que ya existen y ya leen `LIMITS`. Tienen que dar 400 |
| `F1-04` | `pnpm --filter @proxus/server run agent:tutor "muéstrame las páginas 1-1000 de SETS"`. El agente tiene que recibir un rechazo que nombre el techo de 20 y las 1000 pedidas, y **ninguna página renderizada** |
| `F1-05`, `F1-06` | Test de `planRender` con una lista cuyos tamaños acumulados cruzan los 12 MB en la página 14. El aviso tiene que decir 14 y 20. Y a mano: pedir dos veces 15 páginas en el mismo turno; la segunda vez el agente recibe el aviso de presupuesto |
| `F1-07`, `F1-08` | Tests del `RateLimiter` con reloj inyectado. A mano: 21 mensajes seguidos, el 21 da 429 con `retryAfterMs` |
| `F1-09` | `grep -rn "maxMessageCharacters\|maxAgentSteps" packages/web/src` lleva a `Chat.tsx`, que importa `LIMITS`: el contador y el `maxSteps` salen de ahí, ninguna cifra escrita a mano |
| `F1-10`, `F1-11` | `pnpm index:materials` sobre el fixture sintético. Páginas 2 y 4 → `extracted`; 1 y 3 → `transcribed`. Y test unitario de `classifyPage` con 599 y 601 |
| `F1-12` | Abrir el fixture `densidad.pdf` en la web: las páginas 1 y 3 (transcritas) llevan marca ámbar, la 2 y la 4 (extraídas) no. Y un material real indexado: sus páginas extraídas no llevan marca |
| `F1-13` | Test: se fuerza un fallo del modelo en una página y se comprueba que va a `failedPages` con motivo y **no** a `pages` con texto vacío |
| `F1-14` | Tres pruebas, una por dirección. **(a)** Editar un PDF ya indexado: `GET /materials/:id/index` responde `MaterialNotIndexed`, no el índice viejo. **(b)** `touch` sobre un PDF ya indexado: el índice **se sigue sirviendo** y no se reindexa nada, porque el contenido no cambió. **(c)** Renombrar el PDF: el índice se encuentra al instante con el id nuevo, cero páginas al modelo |
| `F1-15` | `pnpm index:materials` sobre `Psicologia Social Tema 1`: el índice trae entre 3 y 40 temas en jerarquía de dos niveles, ninguna página con contenido queda sin tema, y **ningún `label` traduce vocabulario del material** (revisión a ojo, y es invariante 1) |
| `F1-16` | Borrar `.data/materials/index/` y abrir la web: cada material dice "sin indexar", con su acción para indexarlo, **y esa información viene del propio `list`**, sin una petición por material. Ninguno enseña un índice vacío |
| `F1-17` | `curl localhost:3000/api/materials/<id>/pages/11` devuelve la imagen renderizada, esté el material indexado o no |
| `F1-18`, `F1-19` | `curl .../pages/9999` → 400 con el rango válido. `curl .../materials/no-existe/pages/1` → 404. **Ninguno 500** |
| `F1-20` | `file` sobre la imagen devuelta: lado corto 1152 px sea cual sea el tamaño físico de la página (los PDF del corpus son A4: 1152×1630). Y test unitario de `renderDpi` |
| `F1-21`, `F1-22` | Con el control en "Sistema": cambiar la preferencia del SO se aplica sin recargar, y una recarga arranca en ese tema. Elegir "Claro" u "Oscuro": cambia sin recargar; recargar lo mantiene; cambiar el SO ya no lo pisa. Volver a "Sistema": vuelve a seguir al SO |
| `F1-23` | El `grep` de clases de color literales de la sección 3 devuelve **0**. Hoy devuelve 138 |
| `F1-24` | Medidor de contraste sobre texto/fondo, texto/superficie y texto/acento en los dos temas. AA o se ajusta el token |

### Lo que se anota aunque pase

- **D3 de la batería falla y tiene que fallar** (decisión 9). Se anota en `docs/notas-tecnicas.md` como agujero
  conocido con su fecha de cierre en la fase 4. Un check que se desactiva porque molesta deja de
  proteger.
- Lo que tardó y costó `pnpm index:materials` sobre los 9 PDFs reales, medido, en `notes/bitacora.md`.

---

## 9. Fuera de alcance

Nadie amplía esta fase por su cuenta. Fuera:

- **Subida de ficheros.** Fase 4.
- **Reindexado incremental** (reindexar solo las páginas que cambiaron). Hoy un PDF que cambia se
  reindexa entero.
- **Búsqueda dentro del índice**, semántica o de texto. El índice se lee por página y por tema.
- **La sesión en el servidor** y el `tool-result` fabricado. Fase 4, ADR-008.
- **Sustituir los seis `orDie` heredados** de `handlers.ts`. Solo se tocan los endpoints que esta fase
  toca, como dice el ADR-005.
- **Los estados vacíos, de carga y de error de toda la aplicación.** El visor de página nuevo sí los
  lleva; el barrido completo es fase 5.
- **El bloque anti-manipulación del system prompt.** Fase 4.
- **Rediseñar la interfaz.** Esta fase cambia los colores por tokens, no la maquetación.

---

## 10. Riesgos conocidos

1. **El umbral de 600 está calibrado contra un corpus de dos familias muy separadas, y eso puede ser
   suerte.** Un PDF con páginas de 700 caracteres de texto basura (marcas de agua, cabeceras repetidas,
   OCR malo de origen) se indexaría como `extracted` con contenido inútil, y ese fallo es silencioso:
   el índice queda mal sin que nadie lo note. Mitigación parcial: la procedencia se ve en la interfaz y
   el visor abre la página real. **Va a `docs/notas-tecnicas.md` como limitación y como caso de la batería.**
2. **La transcripción es del modelo, no del PDF.** Es la invariante 8 y no se resuelve, se contiene:
   cita a la página, visor con la imagen real y procedencia visible. Verificar salida del modelo con
   salida del modelo no es verificar.
3. **El adaptador de Gemini no manda `generationConfig`**, así que no hay modo JSON forzado (comprobado
   en `gemini.ts`). El JSON del prompt de transcripción puede venir con valla de markdown o con texto
   alrededor. El parseo es defensivo y **el fallo se declara** (`failedPages`), pero si el modelo
   devuelve JSON válido con contenido inventado, eso no se detecta.
4. **Los 12 MB son una cifra medida sobre 9 PDFs, no una ley.** Un material con páginas de diagrama muy
   denso puede pesar el doble por página. El presupuesto avisa y para, que es el comportamiento
   correcto, pero la cifra habrá que revisarla si aparece material así. Es un parámetro, y por tanto un
   sitio donde el sistema se puede equivocar.
5. **La regla del lado corto a 1152 px descansa en cómo Gemini trocea hoy.** Es documentación pública,
   no un contrato: si cambia el troceo, la regla deja de ser óptima (no deja de funcionar, deja de ser
   la más barata). Está aislada en `renderDpi`, una función de una línea.
6. **El limitador de frecuencia por IP es un fusible, no una cerradura** (ADR-007). Sin autenticación
   no hay identidad de cliente que valga. Protege de un bucle accidental y de una demo abierta el fin
   de semana, y de nada más. Va literal a `docs/notas-tecnicas.md`.
7. **La ventana deslizante vive en memoria**, así que reiniciar el servidor la borra. Es aceptable para
   una entrega local y hay que decirlo, no disimularlo.
8. **Construir el harness por petición** (sección 4.5) es un cambio a un sitio que hoy se construye una
   vez. Si resulta caro o si el `Layer` del harness no se deja reconstruir bien en la beta de Effect,
   **se avisa y se cambia el plan** por un `Ref` de presupuesto provisto como servicio, no se improvisa
   una tercera cosa.
9. **`effect@4.0.0-beta.83` es beta.** La forma exacta de `Schema.ErrorClass`, de los checks y del campo
   `error` de `HttpApiEndpoint` está verificada en el `.d.ts`, pero **nada de esta fase se escribe de
   memoria**: si un patrón no está ya en el repo, se mira antes en context7.
10. **El tramo 1A y el 1B juntos son la fase más grande de las cinco.** Si el tiempo aprieta, lo que
    cae **no** son las tres barreras deterministas ni los tests: son requisito, no funcionalidad
    (línea de flotación de la hoja de ruta). Lo primero que cae es el visor de página en la web, que se
    puede sustituir por el endpoint probado con `curl` y documentado.

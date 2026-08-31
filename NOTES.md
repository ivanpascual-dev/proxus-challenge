# NOTES

> Entrega del reto. Se escribe **sobre la marcha**, al cerrar cada fase, no la noche de antes.
> Un `NOTES.md` escrito al final se escribe mal: se olvidan las razones y quedan los resultados.

---

## 1. El problema que elegí

**Nada está conectado con nada.**

El artefacto no sabe de qué material nació: en las 244 líneas que describen todo el modelo de estudio
no aparece la palabra "material" ni una vez. El intento no vuelve al agente: respondes, sacas nota y
ahí muere. Y la interfaz no está conectada con el chat: la aplicación sabe perfectamente qué estás
mirando y no se lo cuenta al tutor, porque el contrato del chat no tiene dónde ponerlo.

Para el alumno eso se ve en dos cosas. **No puede comprobar nada**: la pregunta salió de un PDF suyo y
no hay forma de volver a la página. Y **el tutor no aprende nada**: responde igual de bien la primera
vez que la décima.

**La tesis, en una frase:** cada pregunta sabe de qué página de tus apuntes salió, y cada respuesta
cambia lo que el tutor te propone después.

**Por qué un problema y no cinco.** Mejorar los tests, dar contexto al agente, rediseñar las notas y
arreglar la experiencia parecen cuatro trabajos distintos. Son cuatro sitios donde falta la misma
conexión. Atacar la conexión arregla los cuatro; atacarlos por separado da cuatro parches que no se
sostienen entre sí. Los hallazgos del recorrido por el código son todos caras del mismo hueco.

---

## 2. Cómo lo resolví

<!-- Se rellena al cerrar cada fase. Una sección por pieza, y cada una responde a tres cosas:
     qué problema resuelve, qué decisión se tomó, y qué se descartó y por qué.
     Los trade-offs van aquí dentro, no en un apartado separado: un trade-off suelto de su decisión
     no se entiende. -->

### Índice del material

**Qué problema resuelve.** El tutor releía el PDF entero en cada turno y ninguna pieza podía decir de
qué página salía una afirmación. Sin techos, `materials view apuntes 1-1000` renderizaba mil páginas y
`maxSteps` lo elegía el cliente.

**Qué se construyó.**

- Cada material se indexa página a página por el camino más barato que la sirva: si `pdftotext` saca
  600 caracteres no blancos o más, ese texto es el índice (`extracted`); si no, se renderiza la página
  y la lee el modelo (`transcribed`). El umbral cae en mitad de un hueco medido en el corpus, no se
  elige a ojo (ADR-001).
- El índice se archiva por `sha256` del contenido del PDF, no por su nombre: renombrar un PDF sale
  gratis, editarlo obliga a reindexar, y no existe el estado "índice caducado" (ADR-011).
- Al terminar, una sola llamada al modelo produce los temas del material, en un árbol de dos niveles
  para poder pintarlos como mapa mental. Lo que devuelve el modelo se sanea antes de archivarlo:
  referencia colgante, ciclo o tercer nivel se corrigen (ADR-012).
- Todos los techos del tutor viven en `packages/shared/src/limits.ts` y se imponen en el servidor, no
  en el cliente: caracteres por mensaje, páginas por turno, bytes de imagen por turno (12 MB, contando
  base64), `maxSteps` y frecuencia de peticiones.
- La procedencia viaja en el índice y se ve en el visor: una marca ámbar en las páginas que transcribió
  el modelo, una banda roja en las que fallaron. El texto indexado no se enseña como verdad; se enseña
  la página (invariante 8).

**Qué se descartó.**

- **Un dpi fijo para renderizar.** Producía imágenes de tamaño radicalmente distinto según el tamaño
  físico de la página y pagaba bytes que Gemini descarta antes de mirar. El lado corto a 1152 px es una
  regla que sirve para diapositiva y A4, ahorra el 57 % en diapositivas y no pierde un píxel visible
  (ADR-010).
- **Identificar el material por su contenido.** Ese id viaja dentro de cada cita de las fases 2 y 3;
  corregir una errata en una página cambiaría el id y dejaría huérfanas todas las citas. El nombre para
  el id, el hash para el índice (ADR-011).
- **Cerrar ya el agujero del `tool-result` que fabrica el cliente.** Se cierra en la fase 4 con la
  sesión en servidor; taparlo ahora dejaría al modelo sin el contexto de lo que devolvieron las
  herramientas en turnos anteriores. La batería de ataques lo enseña fallando a propósito (decisión 9
  del plan de la fase).

### Citas verificables

**Qué problema resuelve.** Un apunte era un `string` de markdown: se leía y se cerraba. No había forma
de saber de qué página salió cada afirmación ni de abrir esa página. Y para que el tutor escribiera un
apunte anclado a 20 páginas había que renderizarlas y mandarle 20 imágenes (~31.000 tokens de entrada;
leer el texto ya indexado son ~11.000 y ya está pagado).

**Qué se construyó.**

- `materials read <materialId> <páginas>`: el tutor lee el texto ya indexado, agrupado por tema y con
  su procedencia, sin renderizar nada. Tiene su propio techo de caracteres por turno
  (`maxIndexTextCharactersPerTurn`) y, al alcanzarlo, para y nombra la última página servida frente al
  total pedido (invariante 11: nunca recorte silencioso). El texto servido va entre marcadores
  `<<<BEGIN/END STUDENT MATERIAL>>>` y declarado como dato, nunca instrucción.
- Cada bloque del apunte lleva su fuente: un material con sus páginas, o una URL. El fragmento cacheado
  del bloque (`excerpt`) lo copia el servidor del índice, nunca el modelo (invariante 8): reescribir un
  bloque relee su fragmento, no el material entero.
- Una cita que no ancla contra el índice (material inexistente, sin indexar, página fuera de rango,
  página que falló al indexarse) no se descarta ni se publica como buena: se guarda con su
  `unanchoredReason` y se ve marcada (invariante 3).
- En la interfaz, pulsar la cita despliega la imagen de la página debajo del bloque, reusando
  `materialPageQuery`. La verdad es la página, no el texto indexado.

**Qué se descartó.**

- **Que el fragmento cacheado viniese en el JSON del tutor.** Sería verificar la salida del modelo con
  el modelo. Lo rellena y lo trunca el servidor.
- **Seguir redirecciones al traer una URL.** Obliga a revalidar cada salto contra la lista de
  direcciones privadas, y una revalidación olvidada es justo el agujero que se quería cerrar. Una
  redirección se rechaza nombrando el destino.
- **Un endpoint por operación** (editar, añadir, reordenar, borrar). Son la misma operación: un solo
  `PUT /artifacts/:id/note` con la nota entera. Con un usuario, "el último que guarda manda" es correcto
  y se explica en una frase.

### Perfil de estudio y práctica adaptativa

_Pendiente: fase 3._

### Errores tipados en el transporte

**Qué problema resuelve.** Los tres handlers del grupo `artifacts` usaban `Effect.orDie`, así que un
artefacto inexistente devolvía 500 en vez de 404. Y el listado usaba `Effect.all`: un solo JSON
ilegible en `.data` tumbaba la respuesta entera y la web se quedaba sin barra lateral.

**Qué se construyó.**

- Los doce errores de artefacto declarados en `packages/shared/src/errors/artifact-errors.ts`, cada uno
  con su mensaje en español y su estado HTTP (404, 409, 400, 502, 429, 500). Ningún handler del grupo
  usa `orDie` (invariante 6): un 500 que podía ser "no encontrado" es un fallo silencioso con abrigo
  ruidoso.
- El listado recolecta por fichero: los que decodifican van en `artifacts`, los que no en `unreadable`
  con un motivo corto en lenguaje humano (el detalle técnico va al log del servidor). La barra lateral
  lista los buenos y nombra los malos, en vez de no pintar nada (invariante 3).

**Qué se descartó.**

- **Unificar el esquema de artefactos**, hoy duplicado palabra por palabra entre
  `shared/src/schemas/artifact.ts` y `server/src/domain/artifacts/artifact.ts`. El typecheck no detecta
  que solo se cambie uno. Es refactor de otra fase; por ahora se cambian los dos a la vez y un test
  decodifica un apunte guardado con el esquema de `shared`.
- Registrada la trampa: el campo `error` de `HttpApiEndpoint` quiere un **array** de esquemas, no un
  `Schema.Union`. Con union el servidor devuelve 500 en vez del estado declarado y el typecheck calla.

### Notas por bloques

**Qué problema resuelve.** El apunte era `{kind, id, title, markdown}`: sin forma de corregir un
párrafo que salió mal, de añadir lo que dijo el profesor y no está en el PDF, de reordenar, ni de
saber de dónde salió cada cosa. Nacía en el chat pidiéndoselo al tutor con las palabras justas y salía
en un único bloque plano.

**Qué se construyó.**

- El apunte es una lista ordenada de bloques y `markdown` desaparece del contrato (un `markdown` suelto
  conviviendo con `blocks` son dos fuentes de verdad y la que no se actualiza miente en silencio). Cada
  bloque tiene su markdown, su autoría (`tutor` o `student`), su marca de énfasis (señal separada,
  nunca sumada a nada) y una fuente opcional.
- El apunte nace atado a un material (`materialId`, 1:1) y se ve como una pestaña más dentro del
  material (PDF · Mapa mental · Apuntes), no en una lista aparte. Un material tiene como mucho un
  apunte; el segundo intento devuelve 409. Para rehacerlo: borrar y regenerar.
- La generación sale del agente: un `NoteGenerationService` y una ruta `POST /api/materials/:id/notes`
  con progreso NDJSON, igual que indexar. La estructura es determinista (un bloque por tema del índice,
  en orden, encabezado según profundidad); la prosa la redacta el modelo desde el texto de las páginas
  de ese tema. "Un bloque por tema" pasa de súplica en el prompt a código. El tutor pierde la autoría
  de apuntes: `artifacts create` solo acepta quiz y test (ADR-016).
- Cada bloque se edita en el sitio con un editor de texto enriquecido (TipTap): barra flotante al
  seleccionar texto, menú «/» al empezar una línea. Guarda siempre markdown limpio, sin HTML: cualquier
  formato que solo se represente con HTML no se ofrece, porque rompería la reescritura de bloque y la
  comparación `baseMarkdown` de las propuestas (ADR-017).
- Reescribir un bloque: los botones "Más claro" y "Más a fondo" mandan al modelo solo ese bloque y su
  fragmento, devuelven una propuesta y no guardan nada hasta que el alumno pulsa "Reemplazar".
- El tutor propone añadir, reescribir o borrar bloques; nunca aplica. La propuesta se guarda como
  pendiente dentro del apunte. **No existe comando que acepte una propuesta**, así que ninguna inyección
  consigue una aplicación. Una propuesta guarda el texto que el tutor vio (`baseMarkdown`); si el bloque
  cambió desde entonces, aceptar devuelve 409 con los dos textos.
- Añadir un bloque desde una URL: siete guardas en código (solo `https`, sin dirección privada tras
  resolver el DNS, sin seguir redirecciones, `text/html` o `text/plain`, techo de bytes y de tiempo).
  El fragmento crudo extraído es el recibo verificable; el borrador del bloque lo redacta el modelo.

**Qué se descartó.**

- **Un editor único de documento** que posea toda la nota, con los bloques derivados de sus
  encabezados. Fuente, autoría y énfasis por bloque, más las propuestas que apuntan a un `blockId`,
  obligaban a una pasada de diseño que no compensaba.
- **BlockNote**, que es turnkey pero exporta a markdown con pérdidas: mal cuando el markdown es la
  fuente de verdad y la reescritura compara `baseMarkdown`.
- **El disparador de generación como comando del tutor.** Los comandos del `cli` no tienen canal de
  dependencias para pasar `LanguageModel`, y generar el apunte no tiene ninguna decisión para el
  modelo (entrada: solo `materialId`; forma: por código). Un LLM delante de un botón es un salto que
  puede fallar sin aportar.
- **Un apunte global de varios materiales.** Cada material, su apunte.
- **Migrar las notas viejas de `.data`.** Son de prueba: se borran. Una migración sería código muerto
  desde el primer día.

---

## 3. Cómo probarlo a mano

<!-- Tiene que poder seguirlo alguien que no ha visto el repo, en orden, sin saltarse nada.
     Material concreto, comando concreto, y qué se tiene que ver en pantalla. -->

**Requisitos:** Node, pnpm, Poppler (`pdfinfo`, `pdftoppm` y `pdftotext` en el PATH) y `GOOGLE_GENERATIVE_AI_API_KEY`
en `.env`. El servidor falla al arrancar si falta alguno, a propósito.

**Datos de prueba:** `pnpm run seed:demo` copia los materiales de ejemplo versionados en
`packages/server/fixtures/`. No hacen falta apuntes propios para probarlo.

### Recorrido de la fase 1

1. `pnpm run seed:demo` y luego `pnpm dev`. La web queda en `http://localhost:5173`.
2. **Tema.** El conmutador de tema cambia claro y oscuro sin recargar. Recarga la página: sigue como lo
   dejaste.
3. **Ver un material sin indexar.** Abre uno de la lista. Se ven todas sus páginas en scroll continuo,
   como un PDF. Arriba, un aviso de que no está indexado y un botón para hacerlo.
4. **Indexar.** Pulsa el botón. El progreso avanza página a página. Necesita
   `GOOGLE_GENERATIVE_AI_API_KEY` en `.env` y topa con la cuota gratis de Gemini (15 peticiones/min),
   así que un material grande tarda.
5. **Material indexado.** Aparecen dos pestañas. En "PDF", las páginas que transcribió el modelo llevan
   una marca ámbar en la esquina y las que fallaron una banda roja. En "Mapa mental", los temas salen
   en dos niveles: pulsa uno y el visor salta a su página. El botón "Colores por grupo" tiñe cada área
   y deja sus subtemas del mismo color más claro.
6. **Techos.** En el chat, escribe y mira el contador de caracteres contra el máximo. Con
   `pnpm --filter @proxus/server run agent:tutor "muéstrame las páginas 1-1000 de <material>"`, el
   agente recibe un rechazo que nombra el techo y las 1000 pedidas, y no se renderiza ninguna página.
7. **Página fuera de rango y material inexistente.** `GET /api/materials/<id>/pages/99999` responde 400
   nombrando el rango; un id que no existe responde 404. Nunca 500.
8. `pnpm test` cubre las funciones puras: umbral de densidad (599 frente a 601), escala de renderizado,
   presupuesto de turno y limitador de frecuencia con reloj inyectado.

### Recorrido de la fase 2

Con un material ya indexado (paso 4 de arriba).

1. **Generar el apunte.** Abre el material, pestaña "Apuntes", "Crear apuntes". El progreso avanza tema
   a tema. Al acabar, el apunte tiene un bloque por cada tema del índice, en orden, con el nombre del
   tema como encabezado. Pulsar "Crear apuntes" un segundo material distinto funciona; volver a
   generar el mismo exige "Borrar apunte" primero.
2. **Editar un bloque.** Escribe dentro de un bloque como en un editor normal: selecciona texto y sale
   la barra flotante, escribe «/» al empezar una línea y sale el menú de formatos. Añade un bloque
   tuyo, súbelo de sitio, márcalo como importante. "Guardar". Recarga: sigue igual, y el markdown está
   limpio.
3. **La cita.** Un bloque que viene del material muestra sus páginas. Púlsalas: la imagen de la página
   se abre debajo del bloque, sin salir de los apuntes. Si alguna página la transcribió el modelo, lo
   avisa.
4. **Reescribir.** "Más claro" en un bloque con cita: sale la versión nueva junto a la actual y no se
   guarda hasta "Reemplazar". En un bloque tuyo sin fuente, reescribe y dice que fue sin fuente.
5. **Traer una URL.** "Añadir un bloque desde una URL" con `https://es.wikipedia.org/wiki/...`: entra
   como bloque con su fragmento y un borrador. Con `https://127.0.0.1/x`, `https://[::1]/x` o
   `http://example.com`: rechazado nombrando la dirección o el esquema, sin traer nada.
6. **El tutor propone.** En el chat: "añade a los apuntes del material X un bloque sobre Y". Aparece en
   la pestaña "Apuntes" como propuesta pendiente, con su motivo y un antes/después; no ha tocado ningún
   bloque. Acéptala y pasa a ser un bloque. Pídele después "aplica esa propuesta": no puede, y lo
   explica.
7. **Propuesta caducada.** Propón un `replace`, edita ese bloque a mano y guarda, luego acepta la
   propuesta: 409 con los dos textos, sin aplicar nada.
8. **Errores del transporte.** `curl -i localhost:3000/api/artifacts/no-existe` responde 404 con
   cuerpo y motivo, no 500. `echo 'roto' > packages/server/.data/artifacts/artifacts/roto.json` y
   recarga: la barra lateral sigue listando los demás y nombra `roto.json`.
9. **Interfaz.** Recorre las cuatro pantallas: "Apuntes" en la interfaz, `note` en el JSON, cero
   inglés. La barra lateral separa "Quizzes" y "Tests".
10. `pnpm test` cubre las funciones puras nuevas: los techos del apunte, el casado de bloques por id,
    la construcción del fragmento desde el índice (seis casos), las guardas de URL (rangos privados
    v4/v6/mapeadas, esquemas, content-type, `extractText`), aplicar y caducar propuestas, y la
    generación determinista (un bloque por tema) con un índice de fixture y un modelo simulado.

---

## 4. Checks ejecutados

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

_Salida literal al cerrar la entrega._

Estos checks corren solos en cada PR (`.github/workflows/ci.yml`): typecheck de los cuatro
paquetes, build de la web y `pnpm test`. No hay un linter aparte a propósito. El análisis estático
de este repo es `pnpm typecheck`: `tsconfig` en modo estricto máximo más las reglas de
`@effect/language-service`, que el script `prepare` inyecta dentro del propio compilador. Un
ESLint o un Biome encima repetiría reglas que ya se comprueban, ensuciaría el diff de código de
plantilla y dejaría otra config que defender. La batería de guardarraíles queda fuera de CI:
necesita el servidor y una clave real del modelo, y CI no toca secretos.

---

## 5. Comportamiento esperado, fallos conocidos y cómo lo evalúo

<!-- `CHALLENGE.md:72` lo pide explícitamente para cualquier flujo de AI que se toque, y está fuera
     del apartado "Cómo entregar", así que es fácil saltárselo. Aquí va entero. -->

### Comportamiento esperado

**Indexación de un material (flujo de AI), fase 1.**

- **Tiene que:** usar el texto embebido cuando la página llega al umbral y no llamar al modelo en ese
  caso; renderizar y transcribir solo las páginas por debajo del umbral; guardar la procedencia de cada
  página; producir entre 3 y `maxTopicsPerMaterial` temas en un árbol de dos niveles; conservar el
  vocabulario del material tal cual; archivar el índice por `sha256` del contenido.
- **Tiene prohibido:** traducir el vocabulario del material (nunca "conjunto" si el PDF dice "set");
  inventar temas o relaciones que no estén en el texto; citar una página fuera de `[1, pageCount]` (el
  saneador de jerarquía las descarta); sustituir una página fallida por texto vacío o por el de otra
  página; devolver un índice vacío como si el material estuviera indexado; renderizar más de
  `maxPagesPerTurn` páginas o pasar de `maxTurnImageBytes` en un turno.

**Tutor (chat), lo que la fase 1 ya impone.** Todos los techos que manda el cliente (`maxSteps`,
tamaño y número de mensajes, caracteres) se acotan en el servidor desde `limits.ts`. La llamada al
modelo corre a temperatura baja y fija (`LIMITS.modelTemperature`) con techo de tokens de salida
(`LIMITS.maxModelOutputTokens`) y timeout (`LIMITS.modelCallTimeoutMs`). El agente solo ejecuta
comandos del CLI: no hay comando destructivo ni que edite los apuntes del alumno.

**Generación de apuntes (flujo de AI), fase 2.**

- **Tiene que:** producir un bloque por cada tema del índice, en orden, con el `label` del tema como
  encabezado; redactar la prosa de cada bloque solo desde el texto de las páginas de ese tema; poner la
  cita de cada bloque desde el índice (`materialId` + páginas del tema), nunca desde el modelo;
  comprobar que el material no tiene ya un apunte antes de gastar una sola llamada; emitir el progreso
  tema a tema.
- **Tiene prohibido:** traducir el vocabulario del material; escribir un bloque que mezcle dos temas;
  que el modelo ponga o cambie una cita; dar por "creado" un apunte a medias si el modelo o el
  almacenamiento fallan a mitad (se ve el error real, invariante 3).

**Reescritura de bloque, borrador desde URL y propuestas del tutor (flujos de AI), fase 2.**

- **Reescritura:** al modelo van solo el markdown del bloque y su fragmento cacheado, sin historial,
  sin imágenes, sin el resto del apunte. Devuelve texto y no guarda nada; el alumno ve la propuesta
  junto a su texto y decide.
- **URL:** el fragmento crudo extraído no lo toca el modelo (es el recibo, invariante 8); el borrador
  se redacta solo desde ese fragmento, declarado como dato entre marcadores. Si la redacción falla o
  hay poco texto, el borrador es `null` y el bloque nace vacío: el fallo no se disfraza.
- **Propuestas:** se guardan como pendientes y no tocan ningún bloque. No hay comando ni endpoint que
  el agente pueda usar para aceptar, aplicar o rechazar una.

### Fallos conocidos

- **Cerrado en la fase 4 (tramo 4G):** el `tool-result` fabricado por el cliente que antes se aceptaba
  (check D3 de la batería) ya no tiene ningún canal para entrar en la conversación: la sesión vive en
  el servidor (decisión 6, ADR-008 barrera 3) y el contrato de `POST /api/tutor/chat` ya no lleva
  `messages`. D3 pasa como barrera dura real (`STRICT=1 pnpm test:guardarrailes`, 2026-09-01); el
  script ya no lo marca como hueco conocido.
- **La inyección de prompt no queda resuelta.** El material y el texto pegado se tratan como dato, pero
  el envoltorio con delimitador es de la fase 4. De la batería, el tutor **revela los nombres de sus
  herramientas** (`cli`, las skills) ante pregunta directa (check B4); es hardening de comportamiento
  de la fase 4, no una barrera de código.
- **La cuota gratis de Gemini (15 peticiones/min)** convierte el barrido de un material de muchas
  diapositivas en varios minutos con reintentos. Es un límite del proveedor, no del código.
- **El esquema del índice no lleva número de versión.** Cuando el esquema cambia (el `parentId` de los
  temas, en esta fase), los índices archivados quedan inservibles y hay que borrarlos y reindexar a
  mano; además un índice con esquema viejo hace fallar el listado entero. Pendiente para una fase
  posterior.
- **La jerarquía de temas depende del criterio del modelo.** El saneador garantiza que el árbol es
  válido (sin ciclos, sin referencias colgantes, dos niveles como mucho), no que el reparto de subtemas
  sea el que haría un profesor.
- **El `typecheck:root` de la plantilla nunca pasó y lo quité.** `tsc --noEmit` desde la raíz usaba el
  `tsconfig` base (el que extienden los paquetes), que no fija `jsx`, así que barría `packages/web` y
  reventaba con 206 errores de JSX desde el commit inicial. No hay ningún `.ts` en la raíz fuera de
  `packages/`, de modo que no cubría nada que `pnpm -r typecheck` (los 4 paquetes) no cubra ya.
- **DNS rebinding al traer una URL (fase 2).** Se resuelve el host y después `fetch` lo vuelve a
  resolver por su cuenta: entre las dos resoluciones, un DNS hostil puede cambiar la respuesta.
  Arreglarlo bien exige fijar la IP y pasar la cabecera `Host` a mano; no se hace en esta fase. Sin
  autenticación, quien lo explotaría es el propio usuario contra su propia máquina.
- **`extractText` no es un parser de HTML (fase 2).** Con markup roto puede colar texto de un atributo
  como si fuera contenido. El fragmento y el borrador se enseñan antes de que el alumno acepte, así que
  el fallo es visible y reversible.
- **Un material mal indexado produce apuntes pobres (fase 2).** El servicio redacta cada bloque desde
  `index.pages[].text`; si la extracción falló (varias páginas con 30-670 caracteres), el bloque sale
  flojo. Se arregla re-indexando ese material, no mirando el PDF durante la generación (multi-turno,
  caro).
- **El `PUT` de la nota entera crece con el apunte (fase 2).** Con `maxBlocksPerNote: 200` y
  `maxBlockCharacters: 5_000`, el peor caso es ~1 MB por guardado. Aceptable en local; lo primero a
  cambiar (a operaciones por bloque) si esto fuese a producción.
- **`maxAgentSteps` subió de 8 a 12 (fase 2).** Da holgura al camino de quiz/test, no más seguridad:
  cada paso extra reintroduce el texto no confiable del material en el contexto. Sigue siendo un techo
  claro, lejos del `maxSteps: 10000` que preocupaba en ADR-007.

### Cómo lo evalúo

- **Determinista, en tests (`pnpm test`):** el umbral de densidad (`classifyPage` con 599 y 601), la
  escala de renderizado, el saneador de jerarquía (`normalizeTopicHierarchy` con cada forma rota), el
  presupuesto de turno y el limitador de frecuencia con reloj inyectado. De la fase 2: los techos del
  apunte con 1 por encima y 1 por debajo, el casado de bloques por id (conservado, nuevo, desconocido
  rechazado), el fragmento desde el índice (los seis casos), las guardas de URL (cada rango privado
  v4/v6/mapeadas, cada esquema, cada content-type, `extractText`), aplicar y caducar propuestas, y la
  generación con índice de fixture y modelo simulado (exactamente un bloque por tema).
- **A mano, contra el corpus real:** se indexa un material de cada tipo (diapositivas y A4) y se
  comprueba la procedencia página a página y que ningún `label` de tema esté traducido. De la fase 2:
  generar el apunte de un material de varios temas y comprobar un bloque por tema con su cita, abrir la
  página desde la cita, y que una reescritura no se guarda hasta aceptarla.
- **Coste y latencia:** `pnpm index:materials` imprime cuánto tardó y cuántas páginas fueron al modelo.
  El camino de extracción no cuesta ninguna llamada, y ese es el ahorro que se mide.
- **Nivel de pensamiento de Gemini 3, decidido por camino con datos (fase 4, tramo 4G):** `eval:notes`,
  `eval:assessments` y `eval:judge --thinking=` corridas en off/low/high, dos veces cada una (antes y
  después de traducir los prompts al inglés). Apuntes se queda en "high" (baja los términos traducidos
  de forma consistente, lejos del techo de salida). Examen se queda en "low", no "high": "high" revienta
  el techo de salida (`finishReason: "length"`) en 1 de 3 temas del fixture en las dos pasadas, con un
  pensamiento inestable (1,7k-15,7k tokens); "low" iguala o mejora a "sin pensamiento" con un
  pensamiento estable. Juez se queda "off": ningún nivel mejora el acierto de forma visible, y "high"
  tuvo una caída real de parseo que "off" no tuvo. Detalle completo en `notes/bitacora.md`
  (2026-09-01) y en el comentario de `gemini.ts:451-471`.
- **Seguridad del tutor:** `pnpm dev` en una terminal y `pnpm test:guardarrailes` en otra. Comprueba
  propiedades negativas de la respuesta (no aparece ningún marcador del prompt, no cita una página
  inexistente), nunca una frase de rechazo concreta. Las D bloquean; las B avisan (con `STRICT=1`
  también bloquean); D3 es un hueco conocido que no bloquea hasta la fase 4. La pasada de cierre de la
  fase 2 (auditoría estática de `@guardarrailes` sobre los tres prompts nuevos y las dos puertas al
  mundo, modelo y red) encontró y cerró un bypass de la guarda anti-SSRF con IPv4 mapeada en hex, añadió
  el tope de concurrencia a `rewrite`/`url-source` y el fusible de frecuencia a las escrituras de
  artefacto; el DNS rebinding queda documentado como residuo (arriba).

---

## 6. Qué haría después con más tiempo

<!-- No es una lista de deseos: es un triaje con razones. Cada línea dice por qué NO está construida,
     y la razón tiene que ser una decisión, no "no me dio tiempo". -->

_Pendiente: el banco de ideas triado._

---

## 7. Cómo trabajé

<!-- El párrafo que enmarca `.claude/` y `notes/plans/`. Sin él, esos ficheros son desorden.
     Con él, son la respuesta al único requisito que el código de producto no puede demostrar. -->

_Pendiente._

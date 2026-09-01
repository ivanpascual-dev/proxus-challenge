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
- En la interfaz, pulsar la cita abre el material correcto en la pestaña PDF y salta a la primera
  página citada. La verdad es la página, no el texto indexado.

**Qué se descartó.**

- **Que el fragmento cacheado viniese en el JSON del tutor.** Sería verificar la salida del modelo con
  el modelo. Lo rellena y lo trunca el servidor.
- **Seguir redirecciones al traer una URL.** Obliga a revalidar cada salto contra la lista de
  direcciones privadas, y una revalidación olvidada es justo el agujero que se quería cerrar. Una
  redirección se rechaza nombrando el destino.
- **Un endpoint por operación** (editar, añadir, reordenar, borrar). Son la misma operación: un solo
  `PUT /artifacts/:id/note` con la nota entera. Con un usuario, "el último que guarda manda" es correcto
  y se explica en una frase.

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

### Perfil de estudio y práctica adaptativa

**Qué problema resuelve.** Una prueba terminaba en una nota aislada: no podía volver a la página que
justificaba una corrección, practicar y examinarse eran la misma actividad y el siguiente intento no
sabía qué se había fallado, consultado con pista o marcado como importante.

**Qué se construyó.**

- El código decide la forma completa de cada Control o Examen: alcance, tipos, cantidad, ids y cita
  (`materialId`, `topicId` y páginas). El modelo redacta enunciados, opciones, explicaciones, pistas y
  criterios, pero nunca inventa una página ni un identificador. Una generación incompleta se reintenta
  y, si no llega al número pedido, falla sin guardar una prueba recortada (ADR-019).
- La clave de respuestas no viaja al navegador mientras se resuelve. Los intentos nacen en el servidor,
  guardan inicio, respuestas, pistas, estado y corrección. El historial conserva también los intentos
  cancelados y caducados, pero nunca los corrige ni mueve con ellos el perfil.
- En práctica hay material, pistas y tutor. Un Examen real ocupa la aplicación completa, oculta el
  escritorio y el servidor cierra las rutas de estudio con 409. El reloj cuenta tiempo conectado,
  registra interrupciones y permite retomar o cancelar un examen a medias (ADR-018 y ADR-021).
- La opción múltiple puntúa con crédito parcial y suelo en cero; el Examen real aplica la penalización
  española solo a la nota mostrada. La respuesta corta la juzga el modelo criterio a criterio y el
  código hace la aritmética. Si el juez no puede decidir, se muestra `sin evaluar`: nunca una nota
  neutra inventada (ADR-020).
- El perfil de estudio lo actualiza código determinista al corregir un intento del alumno. Aciertos,
  fallos, blancos, respuestas sin evaluar, pistas y marca de importante permanecen separados. Las
  pruebas de repaso usan esas señales sin convertirlas en una puntuación de dominio (ADR-022).

**Qué se descartó.**

- **Pedirle una nota al modelo.** Un `7` no explica nada; criterios cumplidos más aritmética en código
  sí se pueden auditar.
- **Que el tutor entregue o corrija intentos.** Sería una vía indirecta para que el modelo escribiese
  el perfil. Solo la interfaz del alumno crea correcciones confiables.
- **Un score compuesto de dominio.** Mezclar fallos, pistas y énfasis impide explicar por qué se
  recomienda un tema. Se enseñan y ordenan como señales distintas.
- **El mismo artefacto para practicar y examinarse.** El modo queda fijado al generar: un Control es
  práctica y un Examen nace `De prueba` o `Real`; así un Examen real puede generarse sin pistas.

### Agente con memoria, coste acotado y contexto visible

**Qué problema resuelve.** El cliente enviaba todo el historial al tutor, incluido cualquier
`tool-result` que quisiera fabricar, y las imágenes leídas en un turno se reenviaban en cada paso
posterior. Tampoco había conversaciones persistentes, contexto visible de pantalla ni una subida de
materiales integrada.

**Qué se construyó.**

- La conversación vive en el servidor. El cliente solo manda `conversationId`, el texto escrito y
  referencias de contexto con identificadores; ya no existe canal para inyectar mensajes previos ni
  resultados de herramientas. Las imágenes se conservan durante el turno que las necesita y se
  degradan a una descripción antes de archivarlo.
- El historial guarda turnos, pasos, llamadas, errores y consumo real devuelto por Gemini. Al 75% de
  `maxConversationHistoryTokens` avisa; al 100% rechaza antes de llamar al modelo y propone abrir una
  conversación nueva, sin resumen automático que pudiera cambiar el significado (ADR-023).
- El contexto que la interfaz añade se enseña como chips y se puede retirar antes de enviar. El tutor
  tiene cinco skills separadas por la pregunta del alumno; las cargas repetidas se sustituyen por un
  puntero para no pagar otra vez el mismo cuerpo.
- Cada respuesta puede traer exactamente tres preguntas de seguimiento validadas. La actividad del
  agente se guarda por pasos y la interfaz la traduce a acciones humanas, ocultando JSON, base64,
  claves, prompt de sistema y consumo interno.
- La web valida PDFs antes de escribirlos, permite varios por lote y orquesta subida, indexación y
  apuntes con progreso separado. Borrar un material se lleva en cascada su apunte, pruebas e intentos
  después de un aviso único y explícito (ADR-024).
- Tutor, indexación, apuntes, Control, Examen y juez tienen configuración y techo propios. Las evals
  reales dejaron apuntes en pensamiento `high`, Examen en `low` y juez sin pensamiento: dos
  suposiciones iniciales se revirtieron porque los datos no las sostenían (ADR-025).

**Qué se descartó.**

- **Guardar el historial en el navegador.** Permitía fabricar el pasado y obligaba a reenviarlo
  entero. El servidor es la única fuente de verdad.
- **Mostrar tokens al alumno.** Se implementó y se retiró al probarlo: es observabilidad para logs y
  evals, no información de estudio.
- **Resumir automáticamente una conversación larga.** Introduce otro camino de modelo, presupuesto y
  fallos para algo que se resuelve abriendo una conversación nueva.
- **Un clasificador de modelo para elegir configuración.** El código ya conoce el camino; otra llamada
  solo para decidirlo añadiría coste y latencia.

### Escritorio de estudio

**Qué problema resuelve.** Las capacidades anteriores existían, pero seguían repartidas en una
interfaz de plantilla: demasiadas superficies simultáneas, actividad técnica, apuntes largos, pruebas
sin jerarquía y un mapa que no se podía manipular.

**Qué se construyó.**

- Symma queda organizada como escritorio: sidebar de materiales, Sym como superficie principal y,
  al abrir un material, un espacio de estudio con PDF, mapa, apuntes y pruebas. El historial de chat
  vive en un panel temporal de Sym y cada turno agrupa pregunta, actividad y respuesta.
- El PDF tiene miniaturas diferidas, página activa, salto directo, ajuste de ancho y zoom. Las citas de
  apuntes y correcciones comparten un componente y abren el material y la página correctos.
- Apuntes muestra un índice de bloques y monta un solo TipTap. Cambiar de bloque conserva el borrador
  global sin guardar. Pruebas separa Controles, Exámenes de prueba y Exámenes reales reutilizando el
  mismo solucionador, historial y aislamiento del examen.
- El mapa se calcula una vez y mueve un único grupo SVG: pan no relanza layout, zoom se ancla al cursor
  y hay ajuste, teclado y menú accesible junto al nodo. Con el foco dentro, Ctrl+`+`, Ctrl+`-` y Ctrl+`0`
  controlan el mapa y no el zoom del navegador.
- La cabecera calcula un siguiente paso determinista y explica solo la señal ganadora. El progreso se
  abre en un panel lateral y conserva las seis señales separadas, sin porcentajes ni valores neutros
  ante un fallo de datos.
- Las acciones etiquetadas comparten icono local, descripción, tipografía, hover, foco, pulsación y
  estado deshabilitado. Los selectores de preguntas y modo de examen usan el mismo lenguaje con
  `aria-pressed`; pestañas, filas, miniaturas y herramientas compactas conservan su patrón propio.
- Se verificó teclado, nombres accesibles, contraste semántico, zoom al 200%, movimiento reducido,
  carga diferida del PDF, un solo editor y pan sin medir texto de nuevo.

**Qué se descartó o aplazó.**

- **Una librería nueva de iconos, PDF, split panes o pan/zoom.** La superficie necesaria era pequeña
  y el sistema local mantiene el mismo trazo y hereda los tokens semánticos.
- **Cuatro acciones por tema.** El rediseño previo retiró el salto directo al PDF; `Preguntar a Sym`
  requiere el contexto ampliado de P3. Hasta entonces el menú dice solo `Ir a apuntes` y `Crear
  Control`, que son acciones reales y verificables.
- **P3 de fase 5.** Quedan para después el contexto exacto de superficie/prueba/página, las fuentes
  consultadas persistentes del chat, revalidar la cola acumulada entre varios lotes y el responsive de
  tablet/móvil. La entrega actual cierra escritorio P0, P1 y P2; no afirma capacidades P3.

---

## 3. Cómo probarlo a mano

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
5. **Material indexado.** En "PDF", las páginas que transcribió el modelo llevan una marca ámbar y las
   que fallaron una banda roja. En "Mapa mental", los temas salen en dos niveles: arrastra el fondo,
   amplía, reduce y centra. Pulsa un nodo para abrir sus apuntes o crear un Control de ese tema.
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
3. **La cita.** Un bloque que viene del material muestra sus páginas. Púlsalas: se abre la pestaña PDF
   del material correcto en la primera página citada. Si alguna página la transcribió el modelo, lo
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
9. **Interfaz.** Recorre PDF, Mapa mental, Apuntes y Pruebas: "Apuntes" en la interfaz, `note` en el
   JSON y cero inglés técnico. La barra lateral contiene solo materiales.
10. `pnpm test` cubre las funciones puras nuevas: los techos del apunte, el casado de bloques por id,
    la construcción del fragmento desde el índice (seis casos), las guardas de URL (rangos privados
    v4/v6/mapeadas, esquemas, content-type, `extractText`), aplicar y caducar propuestas, y la
    generación determinista (un bloque por tema) con un índice de fixture y un modelo simulado.

### Recorrido de la fase 3

Con un material indexado y su apunte generado.

1. **Crear un Control.** En el mapa, pulsa un tema y `Crear Control`. Elige el número de preguntas y
   genera. La prueba aparece en `Controles`, conserva el alcance del tema y todas sus preguntas tienen
   fuente verificable.
2. **Práctica.** Pulsa `Practicar`, abre una pista y entrega dejando al menos una pregunta en blanco.
   La corrección enseña nota sobre 10, fuente por pregunta y distingue fallo, blanco y no evaluable.
3. **Respuesta corta.** Responde una pregunta de desarrollo de forma dudosa. El juez devuelve
   criterios cumplidos, no una nota libre. Si no puede corregirla, aparece `sin evaluar`. Usa `Esto sí
   lo dije`: esa pregunta deja de mover el perfil.
4. **Perfil.** Abre `Ver progreso`. Comprueba que aciertos, fallos, blancos, no evaluables, pistas y
   marca de importante están en columnas separadas y que no aparece ningún porcentaje de dominio.
5. **Repaso.** Genera `De repaso`. Cada pregunta dice si entró por un fallo, una pista o una marca; no
   mezcla esos motivos en una puntuación.
6. **Examen de prueba.** Genera un Examen en modo `De prueba`: sigue siendo a libro abierto, sin
   aislamiento de la aplicación.
7. **Examen real.** Genera otro en modo `Real`, lee el aviso previo y empieza. Desaparecen sidebar,
   material y Sym; solo quedan preguntas, reloj, entregar y cancelar. Las respuestas correctas y las
   pistas no aparecen en la respuesta de red.
8. **Retomar.** Recarga con el examen abierto. El navegador avisa y, al volver, el diálogo ofrece
   retomarlo o cancelarlo con el tiempo restante. El historial enseña la interrupción.
9. **Puerta cerrada.** Mientras el Examen real está activo, una ruta de material o artefacto responde
   409 `ExamInProgress`; no depende de que la pestaña esté escondida.
10. `pnpm test` cubre forma de preguntas, parseo, corrección, penalización, reloj, aislamiento,
    actualización separada del perfil, intentos y generaciones completas con modelo simulado.

### Recorrido de la fase 4

1. **Subida real.** Arrastra juntos un PDF válido y un fichero falso. Los dos se validan antes de
   escribir; retira el rechazado y sube el válido. Sigue su cadena: subida, indexación y apuntes.
2. **Varias conversaciones.** Abre el historial de Sym, crea una conversación, cambia a otra y vuelve.
   Los turnos reaparecen desde el servidor. Borrar una conversación no afecta a las demás.
3. **Contexto visible.** Abre un material y escribe al tutor. Antes de enviar aparece su chip; quítalo
   y comprueba que no viaja, vuelve a añadir contexto y comprueba que sí llega.
4. **Actividad segura.** Pide `lista mis materiales`. La actividad cerrada resume la operación en
   lenguaje humano; abierta muestra pasos y fallos abreviados, nunca base64, claves ni el resultado
   crudo de una herramienta.
5. **Seguimiento.** Una respuesta que permita continuar termina con tres preguntas. Pulsa una y se
   envía como un mensaje normal. Un bloque incompleto o con dos preguntas no pinta ninguna.
6. **Historial confiable.** Intenta mandar un campo `messages` o un `tool-result` fabricado a
   `POST /api/tutor/chat`: el contrato no ofrece ese canal. La conversación leída conserva solo lo que
   escribió el alumno y lo que produjo el servidor.
7. **Borrado en cascada.** Borra un material con apunte y pruebas. El aviso nombra todo lo que se
   pierde; después no quedan artefactos ni intentos huérfanos.
8. **Guardarraíles.** Con servidor y clave real, `pnpm test:guardarrailes` comprueba las barreras duras.
   Con `STRICT=1`, B4 sigue señalando que el tutor revela nombres internos de herramientas.

### Recorrido de la fase 5, P0 a P2

1. **Escritorio.** A 1440×900, sin material abierto Sym ocupa la superficie. Abre un material: aparecen
   PDF, Mapa mental, Apuntes y Pruebas con la misma jerarquía visual. Cierra el material y Sym vuelve a
   ocupar el espacio.
2. **PDF diferido.** Recorre miniaturas y páginas; la activa se sincroniza. Al abrir no se solicitan
   todas las páginas. Ajusta ancho y zoom y abre una cita desde apuntes y otra desde una corrección.
3. **Un solo editor.** En Apuntes comprueba que solo existe una `.ProseMirror`. Edita un bloque, cambia
   a otro y vuelve: el borrador sigue sin hacer `PUT` hasta `Guardar apuntes`.
4. **Mapa.** Arrastra, haz zoom bajo el cursor y centra. Con foco dentro prueba Ctrl+`+`, Ctrl+`-` y
   Ctrl+`0`: cambia el mapa y no el navegador. Abre un nodo con teclado, recorre sus dos acciones con
   flechas y cierra con Escape devolviendo el foco.
5. **Pruebas agrupadas.** Crea un Control, un Examen de prueba y uno real; aparecen en sus tres grupos.
   Los selectores `Nuevas / De repaso` y `De prueba / Real` muestran icono y estado activo.
6. **Siguiente paso.** Con perfil vacío explica cómo empezar. Después falla preguntas, abre una pista y
   marca un bloque: la recomendación prioriza fallo, luego pista y luego énfasis, nombrando solo el
   motivo ganador.
7. **Acciones coherentes.** Recorre guardar, borrar, cancelar, generar, volver, empezar, entregar,
   aceptar, descartar, subir y reintentar. Todas muestran icono local y etiqueta, hover, foco visible,
   pulsación y estado deshabilitado; pestañas y herramientas compactas conservan su patrón propio.
8. **Accesibilidad y coste.** Navega con teclado, aplica zoom del navegador al 200%, cambia tema y
   activa `prefers-reduced-motion`. El mapa no recalcula layout durante pan, el PDF carga de forma
   incremental y Apuntes mantiene un editor.

---

## 4. Checks ejecutados

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

Salida del cierre de P2:

```text
pnpm run typecheck
Scope: 4 of 5 workspace projects
packages/ai-google typecheck: Done
packages/shared typecheck: Done
packages/server typecheck: Done
packages/web typecheck: Done

pnpm --filter @proxus/web run build
✓ 814 modules transformed
✓ built in 1.44s

pnpm --filter @proxus/server run typecheck
tsc -p tsconfig.json --noEmit
```

El build mantiene un aviso no bloqueante: el chunk principal supera 500 kB. La suite completa dentro
del sandbox del agente da 50 ficheros en verde y solo falla `densidad-fixture.test.ts`: Node recibe
`EPERM` al hacer `spawnSync("pdftotext")`, aunque Poppler devuelve estado 0 y texto correcto. El mismo
fixture fuera del sandbox pasa sus cuatro páginas (`pass 4, fail 0`). Los tests nuevos de viewport del
mapa y siguiente acción pasan (`pass 2, fail 0`).

Estos checks corren solos en cada PR (`.github/workflows/ci.yml`): typecheck de los cuatro
paquetes, build de la web y `pnpm test`. No hay un linter aparte a propósito. El análisis estático
de este repo es `pnpm typecheck`: `tsconfig` en modo estricto máximo más las reglas de
`@effect/language-service`, que el script `prepare` inyecta dentro del propio compilador. Un
ESLint o un Biome encima repetiría reglas que ya se comprueban, ensuciaría el diff de código de
plantilla y dejaría otra config que defender. La batería de guardarraíles queda fuera de CI:
necesita el servidor y una clave real del modelo, y CI no toca secretos.

---

## 5. Comportamiento esperado, fallos conocidos y cómo lo evalúo

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

**Generación y corrección de pruebas (flujos de AI), fase 3.**

- **Generación:** el servicio decide tema, tipo, cantidad, ids y cita antes de llamar al modelo. El
  modelo solo redacta el contenido pedido. Cuatro opciones significan exactamente cuatro; una
  posición correcta fuera de rango, una pregunta que no parsea o una salida cortada se rechazan. Los
  reintentos piden solo lo que falta y no se guarda nada hasta completar la prueba entera.
- **Juez:** recibe una respuesta corta y su rúbrica, devuelve `gradable` y criterios cumplidos. Nunca
  devuelve la nota. Un fallo de parseo o una respuesta que no puede juzgar produce `sin evaluar` y no
  mueve el perfil.
- **Perfil:** solo cambia con intentos corregidos que pertenecen al artefacto correcto. Las preguntas
  de opción y verdadero/falso siempre cuentan; la respuesta corta solo cuando el juez pudo evaluarla.
  Fallos, pistas y énfasis nunca se suman.

**Tutor persistente (flujo de AI), fase 4.**

- **Tiene que:** cargar la conversación del servidor, escoger una skill por la pregunta real, usar
  primero el camino más barato, consultar datos antes de afirmar y conservar el vocabulario del
  material. El contexto no escrito por el alumno solo entra mediante referencias visibles y
  retirables.
- **Tiene prohibido:** aceptar historial o `tool-result` del cliente, inventar una cita, aplicar una
  propuesta, generar o corregir una prueba desde el chat, revelar datos de otra conversación o tratar
  el material como instrucciones.
- **Persistencia:** tras cada turno se guardan mensajes degradados, pasos, llamadas, fallos y consumo.
  Las preguntas de seguimiento se separan del texto visible y solo aparecen si son exactamente tres
  y cumplen el techo.

**Siguiente paso del escritorio, fase 5.** No llama al modelo. Una función pura cruza índice, existencia
del apunte y perfil: prioriza empezar por el material, continuar los apuntes, practicar un primer tema,
fallos, pistas, énfasis y nueva práctica en ese orden estable. Un error de perfil se muestra como falta
de datos; nunca se convierte en un perfil vacío ni en una recomendación plausible.

### Fallos conocidos

- **Cerrado en la fase 4 (tramo 4G):** el `tool-result` fabricado por el cliente que antes se aceptaba
  (check D3 de la batería) ya no tiene ningún canal para entrar en la conversación: la sesión vive en
  el servidor (decisión 6, ADR-008 barrera 3) y el contrato de `POST /api/tutor/chat` ya no lleva
  `messages`. D3 pasa como barrera dura real (`STRICT=1 pnpm test:guardarrailes`, 2026-09-01); el
  script ya no lo marca como hueco conocido.
- **El tutor revela nombres internos ante pregunta directa.** La fase 4 cerró las barreras de código:
  historial en servidor, `tool-result` del cliente sin canal y material delimitado como dato. La
  batería dura D1–D4 pasa, pero B4 sigue consiguiendo que el modelo nombre `cli` o sus skills. Es
  hardening de comportamiento, no acceso a datos ni ejecución de una capacidad indebida; con
  `STRICT=1` se mantiene visible como fallo.
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
- **Tres listados del CLI siguen sin techo formal (fase 4).** `artifacts show` de una prueba devuelve
  el JSON entero; `artifacts attempts` sin id y `artifacts list` sin filtro devuelven todos sus
  resultados. El impacto actual está acotado por los techos de artefactos e intentos, pero incumplen la
  forma estricta de la invariante 11. Resolverlo exige decidir paginación o rechazo explícito, no un
  recorte silencioso.
- **La prevalidación de subida mira cada selección por separado.** Un duplicado o el máximo repartido
  entre dos aperturas del selector puede quedar visualmente como válido en la cola; `upload` vuelve a
  validar y lo rechaza antes de sobrescribir o pasarse del techo. P3 contempla revalidar la cola
  acumulada e invalidar respuestas asíncronas antiguas.
- **Fase 5 termina en P2.** Sym conoce el material y el artefacto que la fase 4 ya podía adjuntar, pero
  no la superficie exacta, una página concreta ni fuentes consultadas persistentes. Tablet y móvil no
  tienen aún selector de superficie ni sidebar como drawer. Son P3 y no se representan como hechos.

### Cómo lo evalúo

- **Determinista, en tests (`pnpm test`):** el umbral de densidad (`classifyPage` con 599 y 601), la
  escala de renderizado, el saneador de jerarquía (`normalizeTopicHierarchy` con cada forma rota), el
  presupuesto de turno y el limitador de frecuencia con reloj inyectado. De la fase 2: los techos del
  apunte con 1 por encima y 1 por debajo, el casado de bloques por id (conservado, nuevo, desconocido
  rechazado), el fragmento desde el índice (los seis casos), las guardas de URL (cada rango privado
  v4/v6/mapeadas, cada esquema, cada content-type, `extractText`), aplicar y caducar propuestas, y la
  generación con índice de fixture y modelo simulado (exactamente un bloque por tema). De la fase 3:
  forma y parseo de preguntas, corrección, penalización, reloj, aislamiento del examen, perfil y
  generación completa. De la fase 4: degradación de imágenes, deduplicación de skills, prompt estable,
  sesiones, seguimiento y límites de conversación. De la fase 5: layout, agrupación de pruebas,
  tema-a-bloque, viewport del mapa y siguiente acción con todos sus desempates.
- **A mano, contra el corpus real:** se indexa un material de cada tipo (diapositivas y A4) y se
  comprueba la procedencia página a página y que ningún `label` de tema esté traducido. De la fase 2:
  generar el apunte de un material de varios temas y comprobar un bloque por tema con su cita, abrir la
  página desde la cita, y que una reescritura no se guarda hasta aceptarla. De la fase 3: resolver
  práctica y Examen real, retomar uno interrumpido y comprobar el perfil separado. De la fase 4:
  subir un lote mixto, persistir conversaciones y revisar contexto, seguimiento y actividad. De la
  fase 5: recorrido por las cuatro superficies, teclado, 200%, contraste, movimiento reducido, carga
  incremental del PDF, un TipTap y mapa sin relayout durante pan.
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
  inexistente), nunca una frase de rechazo concreta. Las D bloquean; las B avisan y con `STRICT=1`
  también bloquean. La fase 2 cerró un bypass anti-SSRF con IPv4 mapeada en hex y añadió concurrencia y
  frecuencia a las escrituras. La fase 4 cerró D3 al mover el historial al servidor; D1, D2, D3 y D4
  pasan. B4 y el DNS rebinding quedan documentados como residuos, no ocultos como éxitos.

---

## 6. Qué haría después con más tiempo

1. **Cerrar P3 de fase 5.** Primero ampliaría el contexto validado con superficie, prueba y página;
   después guardaría las fuentes realmente consultadas por el tutor. Es la continuación directa de la
   tesis: el alumno debe ver y poder retirar exactamente lo que el agente sabe. No entró en P2 porque
   necesita contratos y persistencia, no solo interfaz.
2. **Ejecutar el corte de correcciones de fase 5.** Probar P0-P2 a fondo dejó doce fallos medidos y ya
   diseñados en `notes/plans/correciones.md`: borrado en cascada del perfil de estudio y de los
   derivados por huella compartida, validación de subida contra el conjunto acumulado de la cola (no
   solo el lote actual), la asimetría de la gracia de concurrencia que produce 429 al preparar varios
   materiales a la vez, temas sin sustento textual real, pruebas parciales por insuficiencia declarada
   en vez de fallo entero, historial de conversaciones ordenado en servidor y el chat como borrador
   local, tooltips contenidos al viewport y los rails contraíbles de sidebar y outline. Tiene su propio
   plan, sus decisiones cerradas y su procedimiento de verificación por criterio (`C5-01` a `C5-15` en
   `docs/especificacion.md`); no entró en esta entrega.
3. **Hacer responsive tablet/móvil.** Un selector Material/Sym en tablet y sidebar como drawer con foco
   atrapado en móvil. Se deja después del escritorio porque resolverlo antes habría obligado a diseñar
   dos navegaciones mientras las superficies todavía cambiaban.
4. **Poner techo a los tres listados del CLI.** Elegiría paginación o un rechazo que nombre el total
   pedido para `artifacts show/list/attempts`. No añadiría un `slice`: un recorte silencioso haría que
   el tutor creyese haber visto todo.
5. **Versionar el esquema del índice.** Evitaría invalidaciones manuales cuando cambie `MaterialIndex`
   y permitiría nombrar una migración o reindexación concreta. No se hizo antes porque durante el reto
   los datos de `.data` son locales y descartables.
6. **Cerrar los residuos de red y parsing de URL.** Fijar la IP después de resolver DNS elimina
   rebinding; un parser HTML real evita leer atributos como texto. Ambos aumentan dependencias y
   complejidad para una función local y revisable, por eso quedaron detrás de los flujos principales.
7. **Medir y dividir el bundle web.** Vite avisa de un chunk principal de ~1,64 MB. Empezaría por PDF,
   TipTap y Streamdown con imports diferidos y mediría antes/después; no partiría por intuición porque
   una carga tardía mal colocada puede empeorar el primer uso del material.

---

## 7. Cómo trabajé

El trabajo se organizó en cinco planes versionados bajo `notes/plans/`, uno por fase. Cada plan fija
el problema, las decisiones cerradas, el orden de implementación, los criterios EARS y la prueba de
cierre. La bitácora no repite el diff: guarda desviaciones, causas raíz, decisiones sobre la marcha y
deuda. Los ADR conservan las decisiones que atan el diseño; el changelog, solo lo que ve el alumno.

El repositorio se construyó con Claude Code usando agentes locales de `.claude/`: `fase` para convertir
una intención en contrato ejecutable, `ejecutar-fase` para respetar ese contrato, `fiel-al-plan` para
buscar deriva, `guardarrailes` para auditar fronteras de modelo y red, y `git-commit` para impedir que
un cambio saliera sin revisar datos privados y documentos. No se delegó la decisión de producto al
modelo: cuando el plan chocó con el código o una prueba real contradijo una suposición, se paró, se
enseñó la evidencia y la decisión quedó escrita.

Cada pieza se cerró en tres capas: funciones puras con `node:test`, typecheck/build del monorepo y un
recorrido real de navegador o API. Las evals con Gemini se reservaron para preguntas que el typecheck
no puede responder, como el nivel de pensamiento por camino, traducción de vocabulario o elección de
skill. El criterio fue siempre el mismo: los modelos redactan y proponen; el código decide forma,
citas, límites, nota, perfil y permisos.

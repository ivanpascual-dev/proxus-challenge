# Decisiones de arquitectura

> Un registro por decisión que **ata el proyecto**: lo que sería caro de deshacer, o lo que el
> siguiente que llegue va a querer cambiar sin saber por qué está así. Lo demás es un comentario en el
> código.
>
> **Se escribe cuando la decisión se cierra**, no al final. Escrito después es un resumen; escrito
> antes es un plan. Nunca se borra un registro: si una decisión se revierte, se escribe otra que la
> sustituye y la anterior se marca como sustituida.
>
> **Cada opción descartada lleva su razón concreta.** Una alternativa sin razón no estaba considerada
> de verdad, estaba de adorno.

---

## ADR-001 · Cada página se indexa por el camino más barato que la sirva, medido

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** Todo lo demás depende de saber qué hay en cada página: sin eso no hay citas, ni temas, ni
"vuelve a la página 12". Y un PDF puede guardar su contenido de dos formas muy distintas: como texto
extraíble o como imagen de la página.

La medición que abrió el problema, sobre 13 PDFs de un curso real (de 6 a 82 páginas): **entre 23 y 306
caracteres extraíbles por página**, cuando una página de texto normal ronda los 2.000-3.000. Son
diapositivas con el código y los diagramas metidos como imagen. Pedirle el texto a esas páginas
devuelve el título y poco más.

**Pero ese es un caso, no la regla.** Un temario en Word exportado a PDF, unos apuntes escritos a
ordenador o un libro digital tienen el texto entero disponible y gratis. Tratarlos como imagen sería
pagar una pasada multimodal para leer algo que ya se podía leer.

**Opciones consideradas.**

- **Siempre extracción de texto.** Gratis e instantáneo. Descartada: en material como el medido
  indexaría casi nada, y el código de ejemplo (justo lo que hay que preguntar) no aparecería nunca.
- **Siempre lectura del modelo como imagen.** Funciona en todos los casos. Descartada como regla fija:
  cobra la pasada multimodal también a los PDFs que no la necesitan. Con un corpus grande y variado,
  eso es coste directo por usuario sin nada a cambio.
- **Decidirlo por material.** Descartada: un mismo PDF mezcla portadas y diapositivas de imagen con
  páginas de texto corrido. La unidad de la decisión es la página, no el fichero.
- **Fragmentos con embeddings.** Descartada por otra razón: la unidad útil aquí no es un fragmento
  parecido, es una página concreta a la que volver. La proximidad no deja decir "vuelve a la página 12".

**Decisión.** Al indexar, **por cada página**: se intenta extraer el texto. Si lo extraído supera el
umbral de densidad, esa página se indexa con su texto. Si no lo supera, se renderiza y la lee el modelo.
El índice guarda, por página, **cuál de los dos caminos se usó**.

**El umbral son 600 caracteres no blancos por página**, calibrado el 2026-08-28 sobre los 9 PDFs del
corpus local (294 páginas), midiendo página a página con `pdftotext`:

| Familia | PDFs | Páginas | Media por página | Página más pobre | Página más rica |
| --- | --- | --- | --- | --- | --- |
| Diapositivas 16:9 | 6 | 261 | 76 a 145 | 0 | **541** |
| A4 de texto corrido | 3 | 33 | 2.157 a 2.458 | **853** | 3.029 |

Entre 541 y 853 no cae ni una sola página del corpus, así que el 600 sale de ese hueco y no de un
criterio. **Corrección a la redacción original de este registro:** quien calibra es el corpus real; el
fixture sintético versionado (`packages/server/fixtures/materials/`) solo **fija** el número como test
reproducible en cualquier clon del repo, porque el corpus real es material de cursos ajenos y no se
sube.

**Consecuencias.**

- Un material con texto se indexa gratis y al instante; uno de diapositivas paga solo por las páginas
  que lo necesitan. El coste sigue al material, no a una suposición sobre el material.
- **El texto que viene del modelo es una transcripción, no el contenido literal del PDF.** Por eso el
  índice marca la procedencia de cada página, la cita apunta siempre a la página y el visor abre la
  imagen real. Si el texto indexado fuese la única prueba, estaríamos verificando al modelo con el
  modelo.
- El umbral es un parámetro, así que es un sitio donde el sistema puede equivocarse. Una página justo
  por encima del umbral con texto basura se indexará mal. Queda como riesgo conocido y como caso de la
  batería de evaluación.

---

## ADR-002 · El perfil de estudio lo escribe el código, nunca el modelo

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** El bucle del producto es que responder cambie lo que se te propone después. Eso exige un
estado por alumno, material y tema, y alguien que lo actualice.

**Opciones consideradas.**

- **Que el agente mantenga su memoria en lenguaje natural.** Descartada: un estado que el modelo
  escribe es un estado que el modelo puede inventar, y aquí ese estado decide qué se te pregunta. Un
  error no se ve: se propaga.
- **Actualizar el perfil al generar el artefacto.** Descartada: en ese momento todavía no hay
  resultado. El dato aparece al corregir, no al preguntar.

**Decisión.** El perfil se actualiza de forma determinista al corregir un intento, en el único punto
donde coinciden pregunta y respuesta. El agente lo lee mediante comandos; no existe ninguna ruta por la
que pueda escribirlo.

**Consecuencias.** El perfil es reproducible y auditable: dados los mismos intentos sale el mismo
perfil. A cambio, solo puede saber lo que se puede corregir, lo que obliga al ADR-003.

---

## ADR-003 · El perfil solo se mueve con correcciones fiables, y las señales no se mezclan

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** Opción múltiple y verdadero/falso se corrigen sin ambigüedad. La respuesta corta hoy se
corrige comparando cadenas en minúsculas, lo que da falsos negativos constantes. Y el alumno además
puede marcar cosas como importantes, que es otra clase de información distinta.

**Decisión.** Opción múltiple y verdadero/falso alimentan el perfil siempre. La respuesta corta solo si
el juez pudo corregirla; si no pudo, se guarda, se enseña y se marca sin evaluar. Y lo que el alumno
marca entra como **señal separada** (`enfasis`), nunca sumada a la dificultad observada.

**Por qué separadas.** Fundirlas en un número hace imposible responder por qué salió una pregunta
concreta. Separadas, el motivo viaja con la pregunta: "entra porque la marcaste" o "entra porque la
fallaste dos veces".

**Consecuencias.** Un falso negativo en respuesta corta mandaría al alumno a re-estudiar algo que ya
sabía, así que preferimos no puntuar a puntuar mal. Hay que enseñar en la interfaz cuándo una respuesta
quedó sin evaluar, porque si no parece que se ignoró.

---

## ADR-004 · La capacidad nueva viaja sobre las herramientas que ya existen

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** El arnés del agente expone exactamente dos herramientas: cargar una skill y ejecutar un
comando. Hace falta que el agente pueda consultar el perfil de estudio.

**Opciones consideradas.**

- **Añadir una herramienta nueva.** Descartada por un motivo comprobado en el código: los parámetros de
  las herramientas están declarados **dos veces**, una en el arnés y otra a mano en el adaptador del
  modelo, con un `switch` cuyo caso por defecto devuelve la firma de una calculadora. Añadir una
  herramienta sin tocar ese `switch` le da esa firma en silencio.

**Decisión.** Las capacidades nuevas se exponen como **comandos** del CLI que ya existe. Cero
herramientas nuevas.

**Consecuencias.** La superficie de herramientas no crece con las capacidades, que es la prueba de que
el diseño del arnés era bueno. El `switch` duplicado sigue siendo deuda: queda anotado aunque esta
decisión lo esquive.

---

## ADR-005 · Los errores se declaran en el contrato compartido, no se matan en el transporte

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** El dominio define errores con nombre y la infraestructura los traduce con cuidado, pero
el transporte los tira todos: hay seis `Effect.orDie` en los handlers, uno por handler. A la web le
llega siempre el mismo 500, así que hoy es imposible mejorar el mensaje de error de nada.

**Decisión.** Todo handler nuevo o tocado declara sus errores en `packages/shared` como parte del
endpoint y los mapea. Los seis heredados se sustituyen en los endpoints que toquemos, no todos de golpe.

**Consecuencias.** El frontend puede distinguir "no encontrado" de "el modelo falló" de "el material no
está indexado", que es media línea de la evaluación ("manejo de errores"). Los `orDie` que queden fuera
de nuestro camino se declaran como deuda conocida y no se disimulan.

---

## ADR-006 · El contexto que recibe el agente es explícito y visible

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** La interfaz ya sabe qué está mirando el usuario y no se lo cuenta al tutor: el contrato
del chat no tiene dónde ponerlo. Al abrir ese hueco aparece la tentación de mandar siempre todo el
contexto disponible.

**Opciones consideradas.**

- **Mandar siempre lo que esté abierto.** Descartada por coste y por confianza: cada llamada cargaría
  material que puede no hacer falta, y el usuario no sabría qué está viendo el modelo.
- **Dejar que el agente lo pida solo.** Ya puede, y se mantiene. Pero no cubre el caso de "quiero
  hablar de esto concreto que tengo delante".

**Decisión.** El contexto viaja en un campo explícito de la petición del chat, se elige (lo que está
abierto, lo seleccionado, o algo nombrado a propósito) y **se ve en pantalla antes de enviar, con
posibilidad de quitarlo**.

**Consecuencias.** El control del gasto lo ejerce quien escribe, no una heurística. Y el agente nunca
usa contexto que la persona no pueda ver ni retirar, que es la invariante de "nada en silencio"
aplicada a la interfaz.

---

## ADR-007 · Los límites son explícitos, viven en el contrato compartido y el presupuesto es por turno

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** Hoy el único límite del sistema es `maxSteps: 8`. `parsePageSelection` valida que la
página sea un entero positivo y que el rango no esté invertido, y nada más: no hay techo de páginas. De
ahí que `materials view apuntes 1-1000` renderice mil páginas a 144 dpi, las convierta a base64 y las
meta todas en una petición. Eso no es lento: es una factura y casi seguro un error de tamaño de la API.

**Por qué el techo por llamada no sirve.** El agente tiene 8 pasos por turno (12 desde la fase 2,
decisión 22) y puede llamar a `materials view` en cada uno. Con un tope de 20 páginas por llamada, un
solo mensaje del usuario puede leer 160 páginas cumpliendo el límite las ocho veces.

**Opciones consideradas.**

- **Recortar en silencio a lo que quepa.** Descartada, y es la peor de todas: el modelo responde sobre
  20 páginas citando con la seguridad de haber leído mil. Un límite invisible produce una respuesta
  indistinguible de una correcta.
- **Límite por llamada.** Descartada por lo de arriba: se multiplica por `maxSteps`.
- **Límite por día solamente.** Descartada: 40 artefactos al día sin ventana corta se gastan en dos
  minutos de bucle. La ráfaga y el gasto son problemas distintos y necesitan ventanas distintas.
- **Solo páginas, sin bytes.** Descartada: las páginas son un sustituto del coste, no el coste. Una
  página de diagrama denso pesa 2 MB y una de texto suelto 80 KB, así que 20 páginas pueden ser 1,6 MB
  o 40 MB.
- **Poner las cifras en el servidor.** Descartada por duplicación: la web necesita el tope de caracteres
  para pintar el contador y desactivar el botón. Si el número vive solo en el servidor, la interfaz se
  inventa el suyo y divergen.

**Decisión.** Un único domicilio para las cifras, `packages/shared/src/limits.ts`, porque un límite es
un contrato y los contratos viven en `packages/shared`. El contador con estado (ventana deslizante en
memoria) es otra cosa y vive aparte, en `packages/server/src/domain/limits/`.

Cuatro familias:

| Familia | Límite | Valor |
| --- | --- | --- |
| Tamaño de entrada | Mensaje escrito | 2.000 caracteres |
| | Material adjuntado por referencia | Sin coste de texto: viaja id, título, páginas y temas. Lo que cuesta es leerlo, y va contra el presupuesto de páginas |
| | Texto pegado por turno (selección, bloque, nota propia, URL extraída) | 12.000 caracteres |
| | Historial reenviado en cada petición | 400 mensajes y 200.000 caracteres |
| | Bloque editado por el alumno | 5.000 caracteres |
| | Fichero subido (fase 4) | 25 MB |
| Coste por turno | Páginas renderizadas | 20 |
| | Bytes de imagen | 12 MB, contando la cadena base64 (medido en la fase 1) |
| | Pasos del agente | 12, **acotado en el servidor** (subió de 8 en la fase 2, decisión 22 del plan: holgura para el camino de generación, no más seguridad) |
| Frecuencia | Mensajes | 20 / 10 min · 200 / día |
| | Artefactos generados | 5 / 10 min · 40 / día |
| | Peticiones simultáneas por cliente | 3 |
| Tamaño de salida | Preguntas por artefacto | 50 |
| | Bloques por nota | 200 |
| | Tokens de salida del modelo | 8.192 (`maxOutputTokens` en cada petición a Gemini) |
| Tiempo | Llamada al modelo | 60 s, aplicado con `AbortSignal.timeout` en el adaptador |
| | Fetch de URL externa (fase 2) | https, 5 s, 2 MB, sin IP privada |

Las cifras de esta tabla son la **decisión**; los valores vivos son los de `limits.ts`. Si divergen,
manda el código y este registro se corrige.

**El presupuesto de páginas y de bytes es por turno**, entendiendo turno como un mensaje del usuario y
todo el trabajo que desencadena. Se repone con el siguiente mensaje, y eso es el objetivo, no un efecto
secundario: leer 60 páginas exige tres mensajes, y entre uno y otro hay una persona decidiendo seguir.

**Los bytes se acumulan mientras se renderiza.** Cuando la siguiente página se pasaría del techo, se
para y se devuelve lo que hay **diciéndolo**: "me detuve en la página 14 de 20, las imágenes llegaron a
12 MB". No es recorte silencioso porque el modelo lee el aviso y puede pedir menos.

**Consecuencias.**

- **Los 8 MB eran un supuesto y ya está medido: son 12 MB, contando base64.** El tope real de la API de
  Gemini con `inlineData` es de **20 MB por petición**, sumando texto, instrucciones y bytes inline. Con
  la regla de renderizado del ADR-010, el caso más pesado medido (20 páginas A4) son **9,4 MB ya en
  base64**, así que 8 MB habría cortado casi todas las peticiones de 20 páginas y habría convertido el
  techo de páginas en letra muerta. Con 12 MB manda el techo de páginas en el caso normal y el de bytes
  solo salta con material anómalo, y quedan 8 MB de holgura hasta el techo de la API. Se cuenta la
  cadena base64 porque es lo que viaja de verdad.
- **Sin autenticación, el limitador de frecuencia es control de coste, no control de acceso.** Solo se
  puede identificar al cliente por IP o por un identificador del navegador, y las dos cosas se cambian
  en diez segundos. Protege de un bucle accidental, de un reintento automático y de una demo abierta el
  fin de semana; no protege de nadie que quiera saltárselo. Es un fusible, no una cerradura, y así se
  escribe en `NOTES.md` en vez de presentarlo como seguridad.
- El tope de preguntas y bloques por artefacto es el que decide si la interfaz de la nota por bloques
  va fluida, así que es un límite de producto además de uno de coste.
- **La petición a Gemini fija `temperature` baja (`LIMITS.modelTemperature`, 0.2) y `maxOutputTokens`
  (`LIMITS.maxModelOutputTokens`).** Sin fijarlas, el modelo corría a temperatura 1.0 y sin techo de
  salida: la indexación producía JSON inestable y la batería de guardarraíles daba resultados
  distintos entre corridas del mismo ataque. La temperatura no es un techo de coste, pero es config de
  seguridad (ADR-008, capa 4) y vive en el mismo domicilio para no repetir el número a mano.

---

## ADR-008 · La seguridad del agente se impone en el código; el prompt se mide

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** El agente lee páginas del material con visión y después ejecuta comandos del CLI, así que
el contenido del PDF es **entrada no confiable capaz de dirigir herramientas**. Y hay tres agujeros
comprobados en el código actual:

| Agujero | Dónde | Qué permite |
| --- | --- | --- |
| `maxSteps` lo elige el cliente | `api/tutor.ts:8` lo declara en el payload; `tutor-chat-service.ts:33` hace `input.maxSteps ?? 8` | `?? 8` es un valor por defecto, no un techo: `maxSteps: 10000` son 10.000 pasos con su llamada al modelo cada uno |
| El historial viene del cliente | El camino HTTP no guarda sesión: `messages` llega en la petición | Fabricar un mensaje de `assistant` ("claro, ignoro mis instrucciones") o un `tool-result` con `result: Schema.Unknown`, que el modelo trata como salida fiable del sistema |
| `messages` no tiene longitud máxima | `api/tutor.ts:6`, `Schema.Array(AgentMessage)` | Mandar un historial arbitrariamente largo |

No se puede colar un `role: "system"`: el esquema solo admite cuatro roles (`agent-message.ts:30`). Esa
defensa ya existe y se conserva.

Y el system prompt son tres líneas (`academic-tutor.ts:20-23`): identidad y poco más, sin bloque
anti-manipulación, sin regla de no-invención y sin tabla de comandos.

**Opciones consideradas.**

- **Resolverlo en el prompt.** Descartada como defensa principal: instruir al modelo para que no obedezca
  instrucciones reduce el éxito de la inyección, no lo elimina, y no hay forma de saber cuándo falla.
- **Un clasificador que filtre material hostil antes de leerlo.** Descartada por coste y por fragilidad:
  una llamada al modelo por página, y falsos positivos sobre material legítimo (un PDF de seguridad
  informática habla de inyecciones).

**Decisión.** Las barreras se separan en **deterministas** (código, siempre dan lo mismo, bloquean el
cierre de fase) y **de comportamiento** (dependen del modelo, son heurísticas, avisan). Las
deterministas son las que protegen; las de comportamiento miden si el prompt aguanta.

**Deterministas, en la fase 1**, porque son límites (ADR-007):

1. `maxSteps` se acota en el servidor. El valor del cliente, si llega, se recorta al techo o se rechaza.
2. Tope de longitud del array `messages` y de caracteres del mensaje, declarados en `limits.ts`.
3. La sesión pasa a vivir en el servidor (fase 4): el `SessionRepository` ya existe en
   `.data/agent-sessions` y solo lo usa el camino del CLI. Eso cierra el historial fabricable **y da la
   funcionalidad de historial de conversaciones**: un cambio, dos cosas.

**De diseño, ya presentes y que no se rompen:**

4. **Lo que no debe hacer, no se le da.** El agente solo ejecuta comandos del CLI: si no existe comando
   de borrar, ninguna inyección consigue un borrado. Todo comando nuevo se revisa contra esto, y el de
   editar bloques de la fase 2 es acción sensible (edita los apuntes del alumno): su confirmación va en
   el código, nunca en el prompt.
5. **El modelo no tiene autoridad que perder.** Sin autenticación, sin datos de otros alumnos y sin
   operación destructiva, la peor inyección consigue un artefacto raro que el usuario ve y borra.
6. **Validar la salida.** Todo artefacto pasa por Schema y por la comprobación de anclaje: la cita que no
   apunta a una página real se marca y se ve (invariante 2). Es el equivalente aquí al guardarraíl de
   "las URLs salen de las herramientas, no de la memoria del modelo".

**De comportamiento, en la fase 4:**

7. **System prompt canónico**: identidad y alcance, regla de datos reales con tabla de comandos,
   herramienta primero, anti-manipulación, no inventar citas.
8. **El material envuelto como datos**, con delimitador y declarado como material del alumno, nunca como
   orden. **Reduce la inyección, no la elimina.**

**Cómo se comprueba.** `scripts/test-guardarrailes.mjs`, de caja negra contra el endpoint por HTTP.
Comprueba **propiedades negativas** de la respuesta ("no aparece ningún marcador del prompt", "no cita
una página inexistente"), nunca una frase de rechazo concreta, porque la frase cambia de un turno a otro.

- **D (deterministas), bloquean:** el endpoint responde; `maxSteps` por encima del techo se rechaza; un
  `tool-result` fabricado no se acepta; mensaje por encima del máximo de caracteres se rechaza; historial
  por encima del máximo se rechaza.
- **B (comportamiento), avisan salvo con `STRICT=1`:** anular instrucciones, cambio de rol, extracción
  del prompt, revelar los comandos internos, tarea fuera del temario, no inventar ante un material que no
  existe, no citar una página que no existe, inyección indirecta desde texto pegado, **e inyección desde
  el PDF**, que es el vector propio de este repo y el único que no aparece en una batería genérica.

No se prueba la exfiltración de datos de terceros: no hay datos de terceros. Decir por qué una capa no
aplica es parte del análisis.

**Consecuencias.**

- **La inyección de prompt no queda resuelta, y decirlo es parte de la entrega.** `CHALLENGE.md:72` pide
  fallos conocidos y cómo se evaluarían: es la limitación principal y va en `NOTES.md` con el número de
  ataques que pasa y que no.
- La barrera 5 depende de que siga sin haber autenticación ni datos de terceros. **Si algún día los hay,
  esta ADR queda obsoleta** y el análisis se rehace desde arriba.
- Las B son heurísticas y pueden fallar por casualidad de vocabulario. Por eso no bloquean por defecto:
  un test de seguridad que da falsos positivos se acaba desactivando, y entonces no protege de nada.

---

## ADR-009 · Los tests van con `node:test`, y solo donde el error es silencioso

- **Estado:** aceptada
- **Fecha:** 2026-08-27

**Contexto.** El repo no tiene ni un test automático: `*.test.ts` y `*.spec.ts` solo aparecen dentro de
`node_modules`. Lo que `docs/testing.md` llama checks automáticos son `typecheck` y `build`, que
comprueban tipos y no comportamiento: un `gradeAttempt` que sume mal las notas los pasa los tres en
verde. Lo único parecido a una prueba es el eval del agente, que llama a Gemini de verdad.

**Opciones consideradas.**

- **Vitest.** Descartada: dependencia nueva y superficie de cadena de suministro nueva para cubrir algo
  que Node ya trae. En una entrega que se defiende en voz alta, no meterla se explica en una frase.
- **Cobertura amplia, incluida la interfaz.** Descartada por presupuesto: hay cinco días y no hay
  navegador automatizado en el repo. La interfaz se prueba a mano y se dice que fue a mano.

**Decisión.** `node:test`, el de Node, cero dependencias nuevas. Y el criterio de qué se prueba no es la
cobertura sino **dónde el error es silencioso**, que además coincide con lo que es lógica pura y corre
en milisegundos: el troceo de páginas y sus fronteras, cada límite justo por encima y justo por debajo,
`gradeAttempt` (incluido que la penalización de examen no toque el perfil), la resolución de respuesta
contra pregunta del mismo artefacto, el anclaje de bloque a páginas y qué pasa cuando no ancla, el
presupuesto de turno al agotarse y la ventana deslizante al liberar.

Los tests **no son una fase**: son regla de cierre de cada fase, y `proxus-verifier` no la cierra sin
ellos.

**Consecuencias.** Los off-by-one de los límites, que son el fallo típico de esta clase de código,
quedan cubiertos. A cambio no hay red bajo la interfaz: un cambio de React que rompa la nota por bloques
no lo detecta nada automático, y eso queda escrito como limitación en `NOTES.md`.

---

## ADR-010 · La página se renderiza con el lado corto a 1152 píxeles, no a un dpi fijo

- **Estado:** aceptada
- **Fecha:** 2026-08-28

**Contexto.** Hoy `poppler-pdf-service.ts:41` renderiza a `dpi = 144` fijo. Un dpi fijo no produce un
tamaño fijo: produce el tamaño que salga de multiplicar por el tamaño físico de la página. Medido sobre
el corpus, esas dos formas conviven en la misma carpeta:

| Forma | Tamaño de página | A 144 dpi | Peso |
| --- | --- | --- | --- |
| Diapositiva 16:9 | 1920 × 1080 pt | 3840 × 2160 px | 344 KB |
| A4 | 595 × 842 pt | 1191 × 1684 px | 362 KB |

**El dato que decide.** Gemini trocea cada imagen en tiles de 768 px, con unidad de recorte
`floor(lado_corto / 1,5)`, y cobra 258 tokens por tile. **El número de tiles sale de la relación de
aspecto, no del número de píxeles**: una página 16:9 son 6 tiles (1.548 tokens) tanto a 3840 × 2160 como
a 2048 × 1152. Todo píxel por encima de lado corto 1152 se descarta antes de que el modelo lo mire.
Así que las diapositivas se estaban renderizando al doble de resolución de la que llega, y pagándose.

**Opciones consideradas.**

- **Dejar el dpi fijo y solo ajustar el techo de bytes.** Descartada: se siguen pagando bytes que el
  modelo tira, y el peso de una página sigue dependiendo de si el PDF es una diapositiva o un A4, que
  es justo lo que hace imposible razonar sobre el presupuesto.
- **`-scale-to 2048`.** Descartada: acota el lado **largo**, así que arregla el 16:9 (149 KB) y
  empeora el A4 (464 KB, sube un 28% respecto a hoy). Acotar el lado largo es acotar la dimensión
  equivocada, porque la unidad de recorte de Gemini se calcula sobre el lado corto.
- **JPEG en vez de PNG.** Descartada: ahorra un 23% en A4 metiendo artefactos de compresión justo sobre
  lo que hay que leer, que en este corpus es código y diagramas.

**Decisión.** El lado corto de la página se renderiza a **1.152 píxeles**, sea cual sea el tamaño físico
del PDF. En dpi es `82944 / lado_corto_en_puntos`: 77 para una diapositiva, 139 para un A4. Sigue siendo
PNG. La cifra vive en `LIMITS.renderShortSidePixels` y la conversión en una función de una línea,
`renderDpi`.

Medido: diapositiva **344 KB → 149 KB** (57% menos), A4 **362 KB → 352 KB** (igual), mismo coste en
tokens en los dos casos y sin perder un píxel de lo que el modelo consume.

**Consecuencias.**

- El peso de una página pasa a depender de la **forma** de la página y no de su tamaño físico, así que
  el presupuesto de bytes del ADR-007 se vuelve razonable de antemano en vez de una lotería por PDF.
- **Es la regla óptima para cómo Gemini trocea hoy, y eso es documentación pública, no un contrato.**
  Si cambia el troceo, la regla deja de ser la más barata; no deja de funcionar. Está aislada en una
  función de una línea para que cambiarla cueste eso.
- Cambiar esta cifra más adelante obliga a **reindexar**, porque cambia lo que el modelo vio al
  transcribir. Por eso es un registro y no un comentario.

---

## ADR-011 · El material se identifica por su nombre; su índice, por su contenido

- **Estado:** aceptada
- **Fecha:** 2026-08-28

**Contexto.** El índice por página (ADR-001) cuesta una pasada del modelo por cada página que no llega
al umbral: 261 de las 294 del corpus local. Hay que saber cuándo un índice guardado sigue valiendo, y la
respuesta ingenua (nombre del fichero, tamaño y fecha de modificación) falla por los dos lados. Falla
hacia el silencio: un PDF reemplazado por otro del mismo tamaño con la fecha tocada sirve el índice
viejo como bueno. Y falla hacia el gasto: `cp -p`, un `git checkout` o copiar los materiales a otra
máquina alteran el `mtime` sin alterar nada, y disparan un reindexado de 261 páginas que no hacía falta.

**Opciones consideradas.**

- **Derivar el `materialId` del contenido**, de forma que un PDF modificado sea un material nuevo.
  Descartada, y es la que más se parece a la buena: ese id viaja **dentro de cada cita** de cada bloque
  de apuntes y de cada pregunta de cada test (fases 2 y 3). Corregir una errata en una página cambiaría
  el id y dejaría huérfanas todas las preguntas generadas desde ese material. Se cambia un índice
  caducado, que el sistema detecta y rechaza en voz alta, por una cita rota en los apuntes del alumno,
  que no detecta nadie.
- **Huella por número de páginas más número de caracteres extraídos.** Descartada por débil y por cara.
  Débil: no detecta que cambies una imagen ni que reordenes páginas sin tocar el texto, que es
  exactamente lo que pasa en un PDF de diapositivas. Cara: medido, recorrer el corpus con `pdftotext`
  tarda **380 ms**, frente a los **10-50 ms** de un `sha256` sobre los mismos 19,6 MB.

**Decisión.** Dos identidades, separadas a propósito:

| Qué | De dónde sale | Para qué sirve |
| --- | --- | --- |
| `materialId` | El nombre del fichero, como hoy | Lo que nombra el agente, lo que va en la URL y **lo que va dentro de cada cita**. Sobrevive a que el PDF se edite, que es el objetivo |
| Huella de contenido | `sha256` de los bytes del fichero | El nombre del fichero del índice: `.data/materials/index/<sha256>.json` |

**El índice se archiva por huella, no por id.** No hay concepto de "índice caducado": o existe un índice
para este contenido exacto, o no existe y hay que construirlo.

**La huella se calcula también en `list()`**, y eso no es un descuido. Medido sobre los 9 PDFs (19,6 MB):
el `pdfinfo` que esa función ya lanza por cada fichero cuesta **90-210 ms**, y el `sha256` de todos ellos
cuesta **10-40 ms**. Añadirlo es entre 5 y 9 veces más barato que lo que ya se estaba pagando ahí. A
cambio, el listado puede decir de una sola pasada qué materiales están indexados y cuáles no, que es lo
que exige la invariante 3 llevada a la interfaz: un material sin indexar se dice, no se enseña con un
índice vacío.

**Consecuencias.**

- **Renombrar un PDF sale gratis:** mismo contenido, misma huella, mismo índice, cero páginas al modelo.
  Con nombre y fecha habría costado un reindexado completo.
- **Reemplazar un PDF por otro del mismo tamaño con la fecha tocada deja de poder engañar al sistema.**
  El fallo silencioso no se detecta mejor: deja de existir.
- Editar un PDF deja su índice viejo huérfano en el disco. **Un índice ocupa 453 KB en el peor caso**
  (58 páginas × 8.000 caracteres), así que unos cuantos huérfanos son un par de megas en una carpeta
  que ya está en `.gitignore`. **Y un huérfano vuelve a ser útil si se deshace la edición**: vuelve el
  hash viejo y el índice está intacto, sin pagar el reindexado. Por eso la limpieza es explícita
  (`index:materials --prune`) y no automática: borrar por defecto sería tirar trabajo ya pagado.
- Un mismo PDF guardado con dos nombres comparte índice, que es lo correcto y además es gratis. **Por
  eso el índice guardado no contiene `materialId` ni `fileName`:** son propiedades del fichero, no del
  contenido, y grabarlas dentro haría que el segundo fichero heredase en silencio la identidad del
  primero. La identidad se resuelve al leer, contra el fichero que hoy tiene esa huella.
- **Borrar un PDF no borra su índice.** Se queda huérfano a propósito: borrar es el caso en que más
  probable es que el fichero vuelva, y si vuelve el mismo contenido vuelve su huella y el índice sirve
  intacto. Lo que sí queda roto son las citas de artefactos que apunten a un material borrado, y eso es
  independiente de esta decisión: viene de que el `materialId` sale del nombre del fichero.
- **Esta decisión depende de que el `materialId` siga saliendo del nombre del fichero.** El día que haya
  subida de ficheros con id generado (fase 4), la primera mitad de este registro se revisa; la segunda,
  la del archivado por huella, no cambia.

---

## ADR-012 · Los temas del material son un árbol de dos niveles, no una lista plana

- **Estado:** aceptada
- **Fecha:** 2026-08-28
- **Sustituye:** amplía la decisión 6 del plan de la fase 1, no la revierte (sigue siendo una sola
  llamada al modelo por material, sobre el texto ya indexado).

**Contexto.** El plan cerró los temas como una lista plana: `{id, label, pages}`. Al probar el tramo 1B,
Iván pidió que el alumno pudiera **relacionar** los temas entre sí, en un mapa mental, no leer una nube
de etiquetas. Una lista plana no tiene de dónde sacar esa relación.

**Opciones consideradas.**

- **Inferir la jerarquía en la web** a partir de las páginas que comparten los temas (un tema que cubre
  un superconjunto de páginas de otro es su padre). Descartada: es un heurístico frágil (dos temas
  hermanos que abarcan todo el material saldrían como padre e hijo) y esconde en el cliente una decisión
  que es del contenido.
- **Pedir al modelo un árbol de profundidad libre.** Descartada: un árbol profundo no cabe en un mapa
  mental legible y multiplica las formas en que el modelo se equivoca (ciclos, cadenas largas). Dos
  niveles es lo que un alumno abarca de un vistazo.

**Decisión.** `MaterialTopic` gana `parentId: string | null`. El prompt de temas (`indexing-prompts.ts`,
plan §6.2) pide al modelo un `parent` por tema, con un máximo de dos niveles y entre 2 y 6 temas de
primer nivel. Lo que el modelo devuelve **no se confía**: `normalizeTopicHierarchy`
(`domain/materials/topic-hierarchy.ts`, puro y con tests) sanea el resultado antes de archivarlo:
referencia a un tema que no existe → el tema pasa a raíz; ciclo → se rompe; tres o más niveles → se
aplana al ancestro raíz. Un `parentId` colgante nunca llega al índice.

**Consecuencias.**

- **El esquema del índice cambia, así que todo índice archivado antes de esta fecha queda invalidado**
  y hay que relanzar `pnpm index:materials`. Es coherente con el ADR-011: no hay "índice caducado", hay
  un índice para este contenido y este esquema, o no lo hay. (Pendiente: el esquema no lleva número de
  versión; hoy la invalidación es manual.)
- La fase 3 se encuentra los temas ya jerarquizados y no tiene que volver a pasar el modelo.
- El coste no sube: sigue siendo una llamada por material.

---

## ADR-013 · El apunte es una lista de bloques, y su procedencia la copia el código

- **Estado:** aceptada
- **Fecha:** 2026-08-28

**Contexto.** La nota era `{kind, id, title, markdown}`: un texto que se lee y se cierra. No se puede
corregir un párrafo, ni añadir lo que dijo el profesor y no está en el PDF, ni saber de qué página
salió cada idea. Y sin esa procedencia, "explícame esto mejor" obliga a releer el material entero.

**Opciones consideradas.**

- **Dejar el markdown y anotar la procedencia aparte**, por rangos de caracteres. Descartada: cualquier
  edición del texto desplaza los rangos y las citas apuntan a otra frase sin que nada lo detecte. La
  unidad de la procedencia tiene que ser la misma que la unidad de la edición.
- **Mantener `markdown` junto a `blocks`** para no romper lo guardado. Descartada: son dos fuentes de
  verdad del mismo texto, y la que se quede sin actualizar miente en silencio. Las notas guardadas eran
  de prueba y se borran.
- **Que el modelo escriba el fragmento de origen dentro de cada bloque.** Descartada, y es la que más
  se parece a la buena: sale gratis y ya viene en la misma llamada. Pero entonces el fragmento que
  "prueba" la cita lo escribe el mismo que hizo la cita, que es verificar al modelo con el modelo
  (invariante 8).

**Decisión.** El apunte es `{kind, id, title, blocks, proposals}`. Cada bloque lleva identidad,
autoría (`tutor` o `student`), marca de énfasis y fuente, que puede ser un material con sus páginas o
una URL. **El fragmento cacheado del origen lo copia el servidor del índice**, nunca el modelo; el
modelo solo declara qué páginas cita.

Una cita que no se puede comprobar contra el índice (material inexistente, sin indexar, página fuera de
rango o página fallida) **no se descarta ni se publica como buena**: el bloque se guarda con el motivo
concreto y la interfaz lo marca.

**Consecuencias.**

- Reescribir un bloque cuesta su fragmento, no el material. Ese es el ahorro que justifica la caché y
  es medible: la petición de reescritura no lleva ni una imagen.
- La marca de énfasis vive en el bloque. El perfil de estudio (fase 3) la derivará a temas por las
  páginas del bloque, que es determinista. Señal separada, nunca sumada (ADR-003).
- El fragmento es una copia: si el material se reindexa, el fragmento del bloque se queda como estaba.
  Es deliberado (el apunte no debe cambiar solo bajo los pies del alumno) y el bloque siempre puede
  abrir la página real, que sí está al día.
- El esquema de artefactos está duplicado entre `packages/shared` y `packages/server/src/domain`. Este
  cambio obliga a tocar los dos y **el typecheck no avisa si solo se toca uno**. La deuda es anterior a
  esta decisión y sigue anotada.

---

## ADR-014 · El tutor propone cambios en los apuntes; aplicarlos es siempre del alumno

- **Estado:** aceptada
- **Fecha:** 2026-08-28

**Contexto.** Editar los apuntes de alguien es una acción sensible: el agente lee páginas de PDF, que
son entrada no confiable capaz de dirigir herramientas (ADR-008). Y a la vez, "añádeme aquí lo que
faltaba" es de lo más útil que puede hacer un tutor.

**Opciones consideradas.**

- **Que el comando escriba directamente y el prompt le diga que pida permiso antes.** Descartada: eso
  pone la confirmación en el prompt, que es exactamente lo que el ADR-008 prohíbe. Una inyección desde
  el PDF conseguiría reescribir los apuntes del alumno.
- **Que el tutor no toque los apuntes existentes.** Descartada por producto: deja "el documento vivo"
  siendo un documento que solo vive por la mano del alumno, y el tutor solo sabe crear notas nuevas.
- **Numerar revisiones por bloque** para detectar que el bloque cambió desde que se propuso.
  Descartada: guardar el texto que el tutor vio cuesta lo mismo, no añade estado al bloque y además
  permite enseñar qué cambió, no solo que cambió.

**Decisión.** El tutor puede proponer insertar, reescribir o borrar un bloque, mediante
`artifacts note propose`. La propuesta se guarda como pendiente dentro del apunte y **no altera ningún
bloque**. La aplica o la descarta el alumno desde la interfaz.

**La confirmación está en el código de la forma más fuerte posible: no existe ningún comando que
acepte, aplique o rechace una propuesta** (ADR-008, barrera 4: lo que no debe hacer, no se le da). Una
propuesta de reescritura o de borrado guarda `baseMarkdown`, el texto que el tutor vio; si al aceptar
el bloque ya no coincide, se rechaza con 409 y se enseñan los dos textos.

**Enmienda (2026-08-29).** `baseMarkdown` lo rellena el servidor con el texto actual del bloque en el
momento de proponer, no lo aporta el tutor. El comando `artifacts note propose` para `replace` y
`remove` recibe solo el `blockId` (y el texto nuevo si reescribe); un `blockId` que no está en el
apunte se rechaza con `BlockNotFound`. Dos motivos: (1) obligar al modelo a reproducir un bloque de
varios párrafos, palabra por palabra, dentro de un argumento JSON de una línea rompía el JSON en la
práctica y la propuesta no se guardaba; (2) si el modelo parafraseaba mínimamente ese texto, la
propuesta nacía caducada. La detección de caducada (F2-29) no cambia: sigue comparando el
`baseMarkdown` guardado con el texto del bloque al aceptar.

**Consecuencias.**

- La peor inyección desde un PDF consigue que aparezca una propuesta que el alumno ve y descarta. No
  consigue una escritura.
- Es conservador de más: un espacio añadido a un bloque caduca la propuesta igual que una reescritura
  completa. Preferimos rechazar de más a aplicar sobre un texto que el tutor no vio.
- Las propuestas viven dentro del JSON del apunte, así que no hay almacén nuevo y tienen su techo
  (`maxPendingProposalsPerNote`), como cualquier otra capacidad (invariante 11).

---

## ADR-015 · La URL externa se trae con guardas en código, y una redirección se rechaza

- **Estado:** aceptada
- **Fecha:** 2026-08-28

**Contexto.** Un bloque de apuntes puede tener como fuente una URL. Eso convierte al servidor en un
cliente HTTP que visita direcciones que elige otro, que es la definición de SSRF. El ADR-007 ya declaró
los techos (https, 5 s, 2 MB, sin IP privada); esta decisión fija cómo se imponen.

**Opciones consideradas.**

- **Seguir redirecciones** (`redirect: "follow"`, el valor por defecto de `fetch`). Descartada: obliga a
  revalidar cada salto contra la lista de direcciones privadas, y una revalidación olvidada reabre
  entero el agujero que la comprobación inicial cerraba. Un redirector público a `127.0.0.1` es trivial
  de montar.
- **Filtrar por lista de dominios permitidos.** Descartada por producto: el alumno pega la URL de sus
  apuntes, de una wiki o del blog del profesor, y una lista blanca la rechazaría casi siempre.
- **Aceptar cualquier tipo de contenido y extraer lo que se pueda.** Descartada: traer 2 MB de binario
  para sacar cero texto es gasto sin nada a cambio, y el mensaje de error se vuelve inexplicable.

**Decisión.** Siete guardas, todas en código y todas rechazando en voz alta con el motivo concreto:
solo `https`; el host se resuelve con `dns.lookup` y se rechaza si **alguna** dirección resuelta es
privada, de loopback, de enlace local o no enrutable (IPv4, IPv6 y las mapeadas); `redirect: "manual"`,
así que una redirección se rechaza nombrando el destino; `AbortSignal.timeout`; corte por bytes leídos;
solo `text/html` y `text/plain`; y extracción de texto con una función pura y probada.

**Consecuencias.**

- **Queda el DNS rebinding**, y decirlo es parte de la entrega: entre nuestra resolución y la que hace
  `fetch` por su cuenta, un DNS hostil puede cambiar la respuesta. Cerrarlo exige fijar la IP y pasar
  la cabecera `Host` a mano. Sin autenticación, quien lo explotaría es el propio usuario contra su
  propia máquina, así que se documenta en `NOTES.md` en vez de arreglarse.
- La extracción de texto no es un parser de HTML y con markup roto puede colar texto que no es
  contenido. El fragmento se enseña antes de aceptarlo, así que el fallo es visible y reversible.
- Muchas páginas reales redirigen (de `example.com` a `www.example.com`, de HTTP a HTTPS). El alumno
  verá el rechazo con el destino y podrá pegar la URL final. Es fricción a cambio de una superficie de
  ataque que no se puede auditar a ojo.

---

## ADR-016 · El tutor autora lo abierto; transformar un material es un servicio con ruta

- **Estado:** aceptada
- **Fecha:** 2026-08-29

**Contexto.** La fase 2 añade la generación de apuntes. La primera versión la hacía el tutor: un
`artifacts create` con el JSON del apunte entero, autorado por el modelo de una tacada. Falló de tres
formas a la vez (un solo bloque plano, JSON frágil, y fallos del agente que la interfaz daba por
"creado" sin nada detrás, violando la invariante 3). La tercera pasada la sacó del agente:
`NoteGenerationService` en el dominio pone la estructura (un bloque por tema hoja del índice, en orden,
cita copiada del índice) y el modelo solo redacta la prosa de cada bloque. Quedaba decidir cómo se
dispara.

**Opciones consideradas.**

- **Comando del CLI del tutor** (`artifacts note generate <materialId>`), disparado desde la pestaña
  "Apuntes" mandando un mensaje al chat. Descartada por dos motivos. Uno, comprobado: el arnés está
  diseñado sin canal de dependencias, los comandos son `Effect<unknown, CliError>` sin `R`
  (`harness/cli.ts:198`), así que pasar el `LanguageModel` a un comando obliga a enhebrarlo a mano por
  los tres sitios donde se construye el arnés. Dos, de fondo: generar el apunte no tiene **ninguna
  decisión** para el modelo (la forma la pone el código, la entrada es solo el `materialId`); poner un
  LLM no determinista delante de una operación que la persona dispara con un botón añade un salto que
  puede fallar o alucinar sin aportar nada.
- **Que el tutor autore el JSON del apunte**, como al principio. Descartada: es exactamente lo que
  falló y motivó sacar la generación del agente.

**Decisión.** Generar apuntes es un **servicio del dominio con su ruta** (`POST /api/materials/:id/notes`,
progreso NDJSON), igual que indexar. El tutor **no** crea apuntes: la skill `create-study-artifacts` le
dice que se generan desde la pestaña "Apuntes" del material y que remita ahí a quien se lo pida.

El límite general: **el tutor autora lo que tiene forma abierta y se pide conversando** (quiz y test;
el modelo decide cuántas preguntas, qué evalúan y la dificultad desde texto libre). **Transformar un
material en un activo de estudio estructurado es un servicio con ruta** (indexar, generar apuntes): el
modelo se llama, pero no decide la forma, y la operación tiene que poder correr fuera de una
conversación.

**Esto no contradice el ADR-004.** El ADR-004 dice que una capacidad **nueva del agente** viaja sobre
las tools que ya existen, no que todo lo que llama al modelo sea una capacidad del agente. Indexar
llama a Gemini, no es un comando del tutor y nadie lo discute; generar apuntes es la misma categoría.

**Consecuencias.**

- **La fase 4 lo agradece.** Al subir ficheros, la cadena "indexar y generar apuntes solos" es
  `IndexingService` y `NoteGenerationService` encadenados en el handler de subida. Si generar apuntes
  fuese un comando del tutor, subir un PDF tendría que arrancar un turno de agente por material. El
  servicio con su ruta ya queda listo para encadenar.
- **El tutor pierde una frase de su repertorio** ("te hago unos apuntes"). A cambio, su frontera es
  honesta y observable: ante la petición, dice dónde se hace. Donde el agente sube de valor de verdad
  es en la fase 4, con más materiales, el perfil de estudio (ADR-002) y el selector de contexto, no
  sellando un clic.
- **Queda una costura**: el servidor tiene dos caminos que llaman al modelo (el arnés del tutor y los
  servicios `IndexingService` / `NoteGenerationService`). Es deliberada y está aquí explicada; no se
  unifica en esta fase.

## ADR-017 · El editor de bloque escribe markdown limpio; lo que no cabe en markdown se queda fuera

- **Estado:** aceptada
- **Fecha:** 2026-08-29

**Contexto.** El tramo 2E cambia el `<textarea>` de markdown de cada bloque por un editor de texto
enriquecido sobre TipTap: barra flotante al seleccionar y menú «/» estilo Notion. El bloque es la
unidad que la reescritura manda al modelo y contra la que se compara el `baseMarkdown` de una
propuesta del tutor (ADR-014); el render de la web es Streamdown sobre ese markdown. Si el editor
guardara HTML, o markdown con HTML incrustado, esos tres mecanismos trabajarían sobre un texto que ya
no es markdown limpio.

**Opciones consideradas.**

- **Plantilla oficial "Notion-like" de TipTap.** Descartada en el plan (§11.2): requiere plan de pago
  y cuenta en TipTap Cloud, y este repo es local, sin nube ni cuentas.
- **Un editor del documento entero (un TipTap por apunte).** Descartada: rompe el modelo de bloques,
  donde fuente, autoría y énfasis van por bloque (ADR-013).
- **Ofrecer todo lo que TipTap trae** (resaltado de color, celdas con formato rico, ecuaciones,
  desplegables, menciones a bloques). Descartada: cada uno exige HTML en el markdown guardado o un
  cambio del pipeline de render.

**Decisión.** El editor por bloque (Vía 1 del plan §11.2) monta un TipTap sobre el markdown de *su*
bloque; `tiptap-markdown` hace el viaje de ida y vuelta con `html: false`. Se ofrecen solo los
formatos que serializan a markdown limpio: encabezados H2-H6, negrita, cursiva, enlace, listas, cita,
bloque de código y tabla GFM (con fila de cabecera y celdas de un solo párrafo). Resaltado de color,
ecuaciones, desplegables y menciones a bloques quedan fuera y se aplazan a la fase 5, cuando se
valore si compensan tocar el contrato del bloque y el render.

**Consecuencias.**

- Lo que se guarda sigue siendo markdown; la reescritura de un bloque, la comparación de propuestas
  (ADR-014) y el render no cambian.
- Round-trip comprobado montando y volviendo a serializar los 28 bloques reales del corpus: 0
  pérdidas de contenido. El `onUpdate` del editor ignora el update cuyo markdown coincide con el de
  carga, para que la re-serialización del montaje no cuente como edición.
- La tabla solo se edita dentro de los límites GFM: quitar fila o columna va siempre por el extremo,
  para no borrar la fila de cabecera ni la primera columna (una tabla sin cabecera se serializaría
  como HTML). El menú «/» está deshabilitado dentro de una tabla.

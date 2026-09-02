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

**Enmienda (2026-08-30).** Declarar el error no basta: el `message` que llega a la pantalla dice qué ha
fallado y qué hacer, nunca cómo. El motivo crudo (un `SchemaError`, una ruta de fichero, un `_tag`, un
`ECONNREFUSED`, "revisa el log") es ruido para quien lee y, en un fallo del servidor, fuga de detalle
interno. Ese detalle se registra con `Effect.logWarning` en el punto donde se produce y no viaja en la
respuesta. En la web, `messageOf(cause)` y `errorFromResponse(response)` (`packages/web/src/lib/`) son
el único camino del error a la interfaz, y un `defect` se enseña siempre como texto genérico.
Generaliza lo que el repo ya hacía en un solo sitio (`file-artifact-repository.ts`, "fase 2,
decisión 28").

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

**Enmienda (fase 4, tramo 4A).** El `@` manual ("algo nombrado a propósito") queda fuera de alcance de
la fase 4: no hay interfaz para adjuntar a mano un material, artefacto o bloque que no esté ya en
pantalla. La decisión pasa de "se elige" a "se propone solo, lo ves y lo quitas": el contexto de
pantalla (`ChatContextRef`, id y título del material, artefacto o bloque activo) se adjunta
automáticamente al mensaje según lo que la interfaz ya tiene abierto (`ChatContextBar`), y la persona
lo ve antes de enviar y puede quitarlo (invariante 9), pero no puede añadir algo que no esté delante.
`maxPastedCharactersPerTurn` queda declarado y sin uso por esto mismo: su caso de uso era el texto
pegado del `@` manual, que no existe hoy.

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
| | Peticiones simultáneas por cliente | 3 (con la excepción de ADR-028: la preparación automática de un material recién subido no consume este cupo) |
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
  intacto. (Lo que sí quedaba roto eran las citas de artefactos que apuntaran a un material borrado;
  esta ADR lo dejó como algo independiente, pendiente de resolver. La fase 4 lo resuelve: ADR-024
  decide que borrar un material se lleva sus artefactos en cascada, así que ya no hay cita huérfana que
  pueda quedar.)
- **Esta decisión depende de que el `materialId` siga saliendo del nombre del fichero.** Revisado
  tras la subida de la fase 4 (`file-material-repository.ts`, `upload`): la subida sigue derivando el
  id del nombre subido (`idFor`, el mismo `path.basename` sin la extensión `.pdf` que usaba `list()`
  antes de esta fase), no genera un id propio. La primera mitad de este registro sigue vigente sin
  cambios; la segunda, la del archivado por huella, tampoco cambia.

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
`baseMarkdown` guardado con el texto del bloque al aceptar. El `insert` sigue el mismo reparto: el
tutor manda `markdown` y, si cita material, `{materialId, pages}`; el servidor genera el `id`, pone
`author: "tutor"`, resuelve el fragmento cacheado desde el índice (invariante 8) y arma el `NoteBlock`
completo. Por eso `ProposeNoteChangeInput` (lo que el tutor manda) tiene forma más escueta que
`NoteProposalOperation` (lo que se guarda en el apunte).

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
privada, de loopback, de enlace local o no enrutable (IPv4, IPv6 y las que embeben una IPv4: mapeadas
`::ffff:…` en cualquier notación, 6to4 `2002::/16` y NAT64 `64:ff9b::/96`); `redirect: "manual"`,
así que una redirección se rechaza nombrando el destino; `AbortSignal.timeout`; corte por bytes leídos;
solo `text/html` y `text/plain`; y extracción de texto con una función pura y probada.

**Consecuencias.**

- **La comprobación de dirección privada expande la IPv6 a sus 16 bytes**, no mira solo el primer
  hextet ni casa con una regex de la forma con puntos. La pasada de `@guardarrailes` del cierre de fase
  encontró que `::ffff:7f00:1` (127.0.0.1 en hex) esquivaba el filtro; el arreglo es una función pura
  con sus tests (`url-guards.ts`, `parseIpv6` + `isPrivateIpv6`).
- **Queda el DNS rebinding**, y decirlo es parte de la entrega: entre nuestra resolución y la que hace
  `fetch` por su cuenta, un DNS hostil puede cambiar la respuesta. Cerrarlo bien exige fijar la IP
  resuelta en la conexión (un dispatcher de undici o un cliente HTTP nuevo) y pasar la cabecera `Host` a
  mano; sobre una beta y para un riesgo que, sin autenticación, es el propio usuario contra su máquina,
  no compensa. Se documenta en `NOTES.md`.
- La extracción de texto no es un parser de HTML y con markup roto puede colar texto que no es
  contenido. El fragmento se enseña antes de aceptarlo, así que el fallo es visible y reversible.
- Muchas páginas reales redirigen (de `example.com` a `www.example.com`, de HTTP a HTTPS). El alumno
  verá el rechazo con el destino y podrá pegar la URL final. Es fricción a cambio de una superficie de
  ataque que no se puede auditar a ojo.

---

## ADR-016 · El tutor autora lo abierto; transformar un material es un servicio con ruta

- **Estado:** aceptada; el límite "el tutor autora quiz y test" lo revierte la fase 3 (ADR-019, ADR-022,
  decisión 4): el tutor ya no crea ningún artefacto, las pruebas salen de la pestaña Pruebas con su
  ruta. La skill se renombró de `create-study-artifacts` a `use-study-assessments`.
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
progreso NDJSON), igual que indexar. El tutor **no** crea apuntes: la skill `use-study-assessments` le
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
- Round-trip fijado con un test: `packages/web/src/components/note/noteBlockSchema.test.ts` monta un
  editor con las mismas extensiones que `BlockEditor` (extraídas a `noteBlockSchema.ts` para que no
  puedan divergir) y comprueba, formato a formato, que serializar es idempotente y que no se cuela
  HTML. El subrayado quedó fuera del esquema (`StarterKit`, `underline: false`): solo se representa
  con `<u>` y se perdería en silencio. El `onUpdate` del editor ignora el update cuyo markdown
  coincide con el de carga, para que la re-serialización del montaje no cuente como edición.
- La tabla solo se edita dentro de los límites GFM: quitar fila o columna va siempre por el extremo,
  para no borrar la fila de cabecera ni la primera columna (una tabla sin cabecera se serializaría
  como HTML). El menú «/» está deshabilitado dentro de una tabla.

## ADR-018 · El modo de una prueba lo fija su generación y vive en el artefacto

- **Estado:** aceptada (anula la decisión 6 del plan de fase 3)
- **Fecha:** 2026-08-30

**Contexto.** El plan de la fase 3 cerró en su decisión 6 que «el modo (práctica o examen) es del
intento, no del artefacto»: el mismo Control se practicaría hoy y se examinaría mañana, y el artefacto
solo guardaría los parámetros de examen que el código deriva del reparto de preguntas. Al construir el
tramo 3C (el examen) esa forma se reveló equivocada:

- Un Examen real se genera **sin pistas** (F3-15). La ausencia de pistas es una propiedad del
  artefacto, no del intento: si el modo lo elige quien empieza, un Examen «real» abierto tendría
  pistas guardadas que no se sirven, y un Control «examinado» no tendría ninguna que ocultar. Los dos
  objetos no son el mismo con otro reloj.
- El techo `maxTestsPerMaterial` no distinguía Examen de prueba de Examen real, cuando son cantidades
  con intención distinta.
- La pestaña Pruebas necesita enrutar desde el listado (`AssessmentListEntry`): el Examen real va a un
  panel a pantalla completa, y eso hay que saberlo antes de abrir ningún intento.

**Opciones consideradas.**

- **Mantener la decisión 6** (modo del intento). Descartada: obliga a generar toda prueba con pistas y
  a decidir «sin pistas» en tiempo de intento, lo que choca con F3-15 y con que la pista es contenido
  que el modelo redacta al generar.
- **Dos `kind` de artefacto distintos** (`test` y `exam`). Descartada: duplica los esquemas espejo y
  el enrutado, cuando el reparto de preguntas, la cita y la corrección son idénticos.

**Decisión.** El modo lo fija la **generación** y vive en el artefacto.

- `AssessmentMode` = `"practice" | "exam"`, en el contrato compartido (`schemas/artifact.ts`) y su
  espejo del servidor.
- El **Control** (`quiz`) es siempre de práctica: no lleva `mode`.
- El **Examen** (`test`) lleva `mode`: `"practice"` es un Examen **de prueba** (a libro abierto, con
  pistas); `"exam"` es un Examen **real** (puerta cerrada, reloj, penalización, generado sin pistas).
- `GenerateAssessmentInput` gana `mode`, que elige quien genera el Examen.
- El **intento** sigue teniendo su `mode`, pero lo **hereda** del artefacto (`test` → `artifact.mode`;
  `quiz` → `"practice"`). `AttemptMode` pasa a ser un alias de `AssessmentMode`.
- Empezar un intento **no lleva cuerpo**: `StartAttemptInput` se elimina y `POST /:id/attempts` se
  queda sin payload.
- `maxTestsPerMaterial` baja de 4 a 2 y cuenta **por modo**: 2 Exámenes de prueba y 2 reales por
  material.

**Consecuencias.**

- El generador sin pistas del Examen real (siguiente commit del tramo) se apoya en `artifact.mode`.
- `AssessmentListEntry` gana `mode` y la pestaña Pruebas puede enrutar el Examen real a pantalla
  completa sin abrir el intento.
- El plan de fase 3 §11 corre sus ADR reservados un número: ADR-018 lo toma esta decisión, y los que
  eran 018-021 pasan a 019-022.
- Este commit mueve el contrato y el servidor y adapta la web para que compile. El selector de
  prueba/real al generar y el panel del Examen real llegan en commits posteriores del tramo.

---

## ADR-019 · El código pone la forma de la prueba; el modelo redacta las preguntas

- **Estado:** aceptada; la frase "O la prueba sale con las N pedidas o no sale (decisión 21)" queda
  sustituida por ADR-026, que autoriza una prueba parcial cuando la insuficiencia de contenido es una
  declaración válida del modelo, nunca un error de formato.
- **Fecha:** 2026-08-30

**Contexto.** El adaptador de Gemini de este repo no manda `generationConfig` en el camino vivo, así
que no hay modo JSON forzado garantizado: la respuesta puede venir con vallas de markdown o texto
alrededor, y el parseo es defensivo ([`model-json.ts`](../packages/server/src/domain/materials/model-json.ts)).
De ese hecho cuelga cómo se genera una prueba. Recoge las decisiones 3, 4 y 5 del plan de fase 3 y su
§1.2.

**Opciones consideradas.**

- **El modelo devuelve la prueba entera** (cuántas preguntas, reparto, cita, identificadores).
  Descartada: abre la puerta a un Control de 6 con 4 preguntas, a una cita de páginas inventada, y al
  fallo de "las opciones son a, b, d y la correcta es la c" por identificadores desincronizados, sin
  ningún punto donde el código lo detecte.
- **Reparto por tipo aleatorio**, una tirada por prueba. Descartada: dos Controles del mismo alcance
  saldrían con repartos distintos sin motivo, y la penalización del examen (que depende del número de
  opciones y de preguntas) dejaría de ser estable.

**Decisión.** El servicio (`AssessmentGenerationService`) pone la **forma**: cuántas preguntas (dentro
del rango que elige el alumno), el reparto por tipo (porcentajes fijos sobre el total, deterministas),
sobre qué tema, y la **cita**, que copia del índice (`materialId`, páginas, `topicId`), nunca del
modelo (invariante 8, F3-01). El modelo solo **redacta**: enunciado, las cuatro opciones como lista de
textos, la correcta como posición, explicación, pista y criterios de rúbrica. Los identificadores
(`a`..`d`, `c1`..`cn`, `q1`..) los asigna el código por posición (decisión 20b, F3-47). Toda pregunta
de opciones tiene exactamente cuatro (decisión 20c). Una pregunta que no decodifica se vuelve a pedir,
solo las que faltan, hasta `maxGenerationRetriesPerTopic` veces; si no sobrevive ninguna, la
generación **falla en voz alta** nombrando cuántas se pidieron y cuántas se guardaron (F3-08 a F3-10,
F3-44 a F3-46). O la prueba sale con las N pedidas o no sale (decisión 21).

**Consecuencias.**

- Es la misma división que ya funcionó en `NoteGenerationService` (ADR-016): el código estructura, el
  modelo pone prosa.
- El reparto se audita con aritmética (`length === 4`, porcentajes sobre el total), no con criterio.
- El riesgo se desplaza de "prueba corta" (resuelto) a "coste y latencia de reintentar": se mide en el
  tramo 3B y las cifras van a la bitácora. Si son malas se añade `responseSchema`; nunca se baja el
  listón del parseo ni se entrega una prueba corta.
- La única superficie del modelo es texto. El material y los enunciados de pruebas previas viajan
  envueltos como datos (`STUDENT_MATERIAL`), y entra en la batería de `@guardarrailes` (ADR-008).

---

## ADR-020 · El juez dice qué criterios se cumplen; la nota la calcula el código

- **Estado:** aceptada
- **Fecha:** 2026-08-30

**Contexto.** El desarrollo corto se corregía con `trim().toLocaleLowerCase()` y comparación exacta: el
falso negativo que el ADR-003 ya nombraba como motivo para no dejar esa corrección tocar el perfil. La
fase 3 mete un juez con rúbrica (decisión 12). Un modelo que devuelve un `7` es un número que nadie
puede auditar.

**Opciones consideradas.**

- **El juez devuelve la nota.** Descartada: no es auditable, y funde el juicio ("¿la respuesta toca
  este criterio?") con la aritmética ("¿cuánto vale tocarlo?"), que son dos cosas con dueños
  distintos.
- **Sin juez, seguir con comparación de cadenas.** Descartada: F3-23 pone la paráfrasis válida como
  caso central, y una comparación exacta la suspende siempre.

**Decisión.** El juez (`OpenAnswerJudge`) recibe enunciado, criterios de rúbrica (conceptos, no frases
del material), el fragmento del que salió la pregunta, y la respuesta del alumno (envuelta como
datos). Devuelve, criterio a criterio, `met: true | false`, y un veredicto `gradable`. **La nota la
calcula el código:** `metCount / rubric.length * maxScore`. Si el juez no puede corregir
(`gradable: false`), si su respuesta no decodifica, o si los identificadores de criterio no casan con
la rúbrica, la pregunta es `unevaluated` con su motivo: no cuenta como acierto ni como fallo, no mueve
la nota mostrada, y se ve como tal (F3-24, F3-25). Nunca una nota intermedia inventada; `unevaluated`
no es cero (ADR-003, invariante 3). La múltiple respuesta lleva dos reglas separadas: crédito parcial
con suelo en cero en la nota mostrada, todo o nada en la señal del perfil (decisión 13, F3-28). El
techo `maxJudgeCallsPerAttempt` es el fusible (F3-26).

**Consecuencias.**

- Es el ADR-002 aplicado a la corrección: la parte que un modelo puede hacer bien (juzgar un criterio
  en lenguaje natural) la hace el modelo; la que tiene que ser reproducible (la cuenta) la hace el
  código.
- Un juez roto se ve, con `unevaluated` explícito, en vez de disfrazarse de nota mediocre.
- El alumno puede discrepar de un criterio ("esto sí lo dije"): la pregunta pasa a `unevaluated` por
  discrepancia, se retira su aportación al perfil y la nota mostrada del intento no cambia (F3-43,
  ADR-022).
- Riesgo residual (falso negativo del juez, sobre todo la paráfrasis válida): medido por la eval de
  §6.7.2, con la paráfrasis como caso central. Va a `NOTES.md` con su cifra y con la palabra "no
  resuelto".

---

## ADR-021 · La clave no viaja al navegador y el examen cierra la puerta

- **Estado:** aceptada
- **Fecha:** 2026-08-30

**Contexto.** Qué hace de un examen un examen y no una práctica con reloj. Recoge las decisiones 8, 9,
18, 19 y 20 del plan de fase 3. El modo (práctica o examen) lo cubre el ADR-018.

**Decisión.** Tres barreras, las tres en el servidor:

1. **La clave no viaja mientras se resuelve.** `GET /:id/solvable` sirve una proyección de la prueba
   sin `correctOptionId`, `correctAnswer`, `expectedAnswer`, rúbrica ni explicación. La corrección
   sale al entregar, en los dos modos (F3-11, F3-12). Un examen cuyas respuestas están en el código
   fuente de la página no es un examen (decisión 9).
2. **El intento se crea en el servidor al empezarlo,** no al entregarlo (decisión 8). Da `startedAt`
   con autoridad (sin eso el cronómetro es decorativo), el sitio donde registrar las pistas cuando se
   abren, y un intento a medias que se ve si se abandona. Empezar no lleva cuerpo (ADR-018).
3. **Un examen en curso cierra la puerta** (decisión 18). Mientras un intento en modo examen siga
   `in-progress`, las rutas del material, los apuntes, el mapa mental, otras pruebas y el chat del
   tutor responden **409 `ExamInProgress`**. La barrera está en el código (`ExamLockdownGuard` sobre
   una única lista `CLOSED_ROUTES` / `OPEN_ROUTES` con test de cobertura de rutas), no en esconder
   pestañas. De la puerta **siempre se sale y se ve cómo** (decisión 19): el 409 nombra el intento y
   dice cómo salir; el intento se cancela en cualquier momento y caduca solo al pasar su tiempo. Un
   examen a medias se retoma aunque pasen horas: perder la red o cerrar la pestaña no lo cancelan
   (19b). El reloj cuenta el **tiempo conectado**, medido por el latido; los huecos se guardan como
   `interruptions` y el historial los enseña (19c, invariante 3). Al arrancar la aplicación con un
   examen a medias, el diálogo "tienes un examen a medias" es también la llave de la puerta (19d).
   Quien decide si una entrega llegó tarde es el servidor, con `examSubmitGraceSeconds` de margen
   (decisión 9, F3-21).

La penalización del modo examen sigue la convención española (`aciertos − errores/(opciones−1)`, en
blanco ni suma ni resta, escalada a 10, suelo en 0) y **solo cambia la nota mostrada**: no toca el
perfil (decisión 16, F3-22, invariante 5).

**Consecuencias.**

- La salida siempre visible es la invariante 3 llevada al encierro: un candado sin salida es un bug,
  no una regla de producto.
- El cronómetro depende del reloj del servidor: si el proceso se reinicia a mitad de examen,
  `startedAt` sobrevive en disco y el tiempo sigue corriendo. Es lo correcto y la interfaz lo dice
  (riesgo 4).
- La fase 4 (subida de ficheros) tendrá que clasificar sus rutas nuevas en una de las dos listas o el
  test de cobertura falla.

---

## ADR-022 · El perfil se mueve solo con intentos del alumno

- **Estado:** aceptada
- **Fecha:** 2026-08-30

**Contexto.** La fase 3 es la primera que tiene un perfil de estudio que mover, así que las invariantes
4 (el perfil lo escribe el código, nunca el modelo) y 5 (las señales no se mezclan) dejan de ser
teoría. Recoge §1.3 del plan y la decisión 7.

**Decisión.** El perfil (`StudyProfileService`) lo mueve solo el código, al corregir un intento
`graded`, de forma determinista e idempotente por intento (`appliedAttemptIds`). Se **reconstruye
entero** desde todos los intentos corregidos del material en cada escritura (proyección pura), no se
aplica incremental: así "esto sí lo dije" reescribe un intento ya aplicado sin necesitar un camino de
reversión aparte. Tres señales **separadas** por tema, nunca fundidas en un número:

- dificultad observada (`correct` / `incorrect` / `unevaluated` / `blank`); no responder no es fallar,
  `blank` va aparte,
- pistas abiertas (`hintsRevealed`); abrir una pista nunca convierte un acierto en fallo (decisión
  11),
- énfasis, que se deriva del bloque marcado del apunte al **leer** el perfil, no se guarda.

**El tutor pierde `artifacts submit` y `artifacts grade`** (además de `create`, que ya se fue por la
decisión 4). Motivo: si los conservara podría mover el perfil **fabricando intentos**, y la invariante
4 se rompería de forma **indirecta**, sin que ninguna línea de código diga "el agente escribe el
perfil". No es una simplificación: es la invariante impuesta en el código. El tutor gana `profile
show`, de solo lectura (ni siquiera dispara el recálculo). No hay ninguna ruta ni comando que escriba
el perfil: `sync` solo lo llaman `attempt-service.submit` y `attempt-service.dispute`, caminos del
alumno desde la interfaz (F3-31).

**Opciones consideradas.**

- **Aplicar el intento incremental** (`applyAttempt` sobre el perfil guardado). Descartada: la
  discrepancia obliga a un camino de reversión que la reconstrucción desde cero no necesita, y el
  rebuild sigue siendo determinista e idempotente (§6.5).
- **Dejar al tutor `submit` y `grade` anclados**, como se hizo con los apuntes. Descartada: mover el
  perfil no es autorar contenido abierto (ADR-016), es escribir la señal que gobierna qué se le
  pregunta al alumno después.

**Consecuencias.**

- Un fallo al recalcular el perfil no tumba la entrega (fail-open: se registra con `logWarning` y el
  perfil se rehace en el siguiente `sync` o `read`). Dejar sin corregir un intento por un fallo de
  disco del perfil sería peor.
- El repaso (`origin: "review"`) sí falla en voz alta si no hay perfil: sin señal no hay nada que
  concentrar (F3-33). Distinto del fail-open de la entrega: allí la alternativa era descorregir; aquí
  es generar un repaso inventado.
- El perfil es por material; cruzarlos es otra fase.
- Quitarle tres comandos al tutor puede dejarlo pobre en la demo (riesgo 8): la fase 4 es la que lo
  compensa.

## ADR-023 · El historial de una conversación tiene un techo de tokens, con aviso al 75% y corte al 100%

- **Estado:** aceptada
- **Fecha:** 2026-08-31

**Contexto.** La fase 4 mueve la sesión del tutor al servidor (decisión 6 del plan): una conversación
guardada puede crecer sin límite mientras la persona siga escribiendo. Nada del plan escrito cubría
ese caso; surgió al preguntar Iván, tras cerrar el tramo 4C, qué pasaba con una conversación que no
termina nunca. Se decidió en esta misma sesión, no en la planificación de la fase.

**Decisión.** Un fusible sobre la conversación **entera**, no sobre el turno individual (eso ya lo
hacen `maxMessageCharacters`/`maxAgentSteps`): `maxConversationHistoryTokens = 80.000`. Al 75% se
avisa al terminar el turno, informativo, la conversación sigue usándose. Al 100% el turno siguiente se
rechaza **antes** de llamar al modelo, sin gastar la llamada. Ambos casos sugieren empezar una
conversación nueva; no hay resumen ni compactación automática del historial.

El tamaño se mide con el dato **real**: los `inputTokens` medidos (`usageMetadata` de Gemini) del
último paso del último turno ya guardado, nunca una estimación de caracteres. Sin ese dato
(conversación nueva, o el modelo no lo trajo esa vez) no se avisa ni se rechaza (invariante 3: no
fabricar un límite superado donde no hay dato).

**Opciones consideradas.**

- **Resumir o compactar el historial automáticamente** al acercarse al techo (lo que hacen varios
  agentes de código). Descartada por sobre-ingeniería para este caso: exige un camino de resumen con
  su propio presupuesto y sus propios fallos, para un techo (80.000 tokens) que una sesión de estudio
  normal tarda en alcanzar. Empezar una conversación nueva es gratis y ya existe.
- **Contar caracteres del historial guardado**, como hacía el mecanismo retirado
  (`maxHistoryMessages`/`maxHistoryCharacters`, fase 1). Descartada: un carácter no cuesta lo mismo
  que otro en tokens (código, símbolos, idioma), y el coste real que importa es el que cobra el
  modelo, no una aproximación.
- **Cortar solo al 100%, sin aviso previo.** Descartada: la persona pierde el mensaje que estaba
  escribiendo sin ninguna señal previa; el aviso al 75% deja margen para terminar la idea y migrar a
  una conversación nueva sin perder nada.

**Consecuencias.**

- El fusible depende de que exista un turno guardado con `usage` medido: la primera conversación, o
  una donde el modelo nunca devolvió `usageMetadata`, no tiene nada que comparar y no bloquea nunca
  (mismo criterio que el resto de la fase 4 con datos de coste, F4-19).
- Una conversación que se queda justo por debajo del 75% para siempre es posible (no hay techo de
  turnos ni de tiempo, solo de tokens): aceptado, es el mismo fusible de coste que el resto de la fase,
  no una cuota de uso.
- Si el techo resulta corto o largo en uso real, se ajusta la cifra en `limits.ts`; no hace falta
  tocar el mecanismo.

---

## ADR-024 · Borrar un material se lleva sus artefactos, en cascada y sin preguntar dos veces

- **Estado:** aceptada; la frase "el índice cacheado... no se toca" queda sustituida por ADR-027, que
  sí lo borra cuando el material borrado era la última referencia a esa huella.
- **Fecha:** 2026-08-31

**Contexto.** El plan de la fase 4 no traía borrado de materiales; surgió al hablar con Iván de qué
pasaba, ahora que subir un PDF es una acción normal desde la interfaz, cuando alguien se equivoca de
fichero o quiere quitar uno. ADR-011 ya se había topado con el problema y lo había dejado explícitamente
abierto: "lo que sí queda roto son las citas de artefactos que apunten a un material borrado, y eso es
independiente de esta decisión". En fase 1 ese hueco era teórico, no había forma de borrar un material
desde la aplicación. Con un botón real, deja de serlo: cada borrado dejaría un apunte, unos controles y
unos exámenes citando un `materialId` que ya no abre nada, exactamente el fallo silencioso que el
sistema evita en cualquier otro sitio (invariante 3).

**Decisión.** Borrar un material borra también, en cascada, todo lo que cuelga de él: su apunte, sus
controles y sus exámenes con sus intentos. La interfaz avisa del alcance de la pérdida antes de llamar
(confirmación con la lista de lo que se pierde); el servidor no vuelve a preguntar, igual que en el
resto de acciones destructivas del sistema (borrar una conversación, borrar un bloque). La orquesta
`MaterialDeletionService` (`domain/materials/`): lista los artefactos, filtra los que pertenecen a ese
`materialId`, los borra uno a uno con `ArtifactRepository.deleteArtifact` y solo entonces borra el PDF
con `MaterialRepository.remove`. El índice cacheado por huella de contenido (ADR-011) no se toca: sigue
siendo una optimización compartida entre ficheros, no algo del usuario.

**Opciones consideradas.**

- **Dejar los artefactos huérfanos**, como contemplaba ADR-011 cuando el borrado no existía. Descartada
  por la razón de arriba: con un botón real el huérfano deja de ser un caso raro y pasa a ser lo normal
  cada vez que alguien borra algo.
- **Borrado suave (papelera, deshacer).** Descartada por alcance: ninguna otra acción destructiva del
  sistema es reversible (conversación, bloque), y añadir una papelera solo para materiales rompe esa
  coherencia sin que el reto la pida.
- **Confirmar también en el servidor**, con un segundo golpe además del de la interfaz. Descartada: es
  el mismo patrón que ya usan borrar una conversación y borrar un bloque, la interfaz es quien avisa y
  el servidor ejecuta.

**Consecuencias.**

- El párrafo de ADR-011 que dejaba el problema abierto queda corregido para apuntar aquí.
- Borrar y resubir el mismo PDF (mismo nombre, `materialId` de ADR-011) ya no puede reencarnar
  artefactos huérfanos con datos desincronizados: al borrar, sus artefactos desaparecen con él, así que
  resubir empieza limpio.
- Un fallo a mitad de la cascada (por ejemplo, un artefacto que no se deja borrar) deja el material sin
  borrar y algunos artefactos ya borrados: no hay transacción entre dos repositorios de ficheros
  distintos. Se acepta porque el caso es raro (el mismo fallo que impediría borrar el artefacto desde su
  propia pantalla) y el estado resultante es visible, no silencioso.

---

## ADR-025 · El techo de salida y el pensamiento del modelo se fijan por camino, con datos

- **Estado:** aceptada
- **Fecha:** 2026-09-01

**Contexto.** Hasta la fase 4 el tutor tenía dos capas de Gemini: una para conversación
(`GeminiLanguageModelLive`, temperatura baja) y una para JSON (`GeminiJsonLanguageModelLive`,
temperatura 0), y las dos compartían el mismo techo de salida (`LIMITS.modelOutputTokens.tutor`,
4.096) sin importar si detrás había un chat, una indexación, un apunte, un Control, un Examen o el
juez de respuesta abierta. Gemini 3 añade además `thinkingConfig.thinkingLevel` (off/low/high): el
modelo puede "pensar" antes de responder, y ese pensamiento gasta tokens del mismo techo de salida,
no de uno aparte. Compartir capa entre caminos tan distintos (temperatura, formato, longitud esperada,
coste de un error) era una simplificación que ya no se sostenía.

**Opciones consideradas.**

- **Seguir con dos capas compartidas, techo único.** Descartada: un Examen de 30 preguntas necesita un
  techo muy por encima del de un apunte de un bloque, y fijar el techo más alto de todos como techo
  único paga ese coste en cada camino, incluidos los baratos.
- **Configurar el modelo ad hoc en cada punto de llamada.** Descartada: sin una capa nombrada por
  camino, la temperatura, el formato y el techo de cada sitio se deciden por copiar y pegar el punto de
  llamada más parecido, y no hay un solo lugar que diga qué lleva cada uno ni por qué.
- **Fijar el nivel de pensamiento de cada camino por impresión, sin medir.** Es lo que asumía la
  decisión 14 original (apuntes y juez con pensamiento, indexación y Control sin él, Examen a decidir).
  Descartada como método: el tramo 4G la puso a prueba con las evals reales
  (`eval:notes`, `eval:assessments`, `eval:judge --thinking=`) y dos de las tres suposiciones no se
  sostuvieron (ver más abajo).

**Decisión.** Seis capas de producción, una por camino, cada una una función pura de
`GeminiGenerationConfig` (temperatura, formato, techo de salida y, donde aplica,
`thinkingConfig`): `tutor`, `indexing`, `note`, `quiz` (Control), `test` (Examen) y `judge`
(`gemini.ts`). Cada techo de salida (`LIMITS.modelOutputTokens.<camino>`, `packages/shared`) es el
doble del caso peor calculado de ese camino, pensamiento incluido donde lo lleva, sin pasar del límite
del modelo (65.536): es el fusible contra una salida desbocada, no un control de coste, porque se paga
por lo generado, no por el techo. El nivel de pensamiento de cada camino se decidió corriendo las tres
evals de medida dos veces cada una (antes y después de traducir los prompts al inglés, tramo 4G, paso
21), off/low/high, y quedándose con lo que los datos mostraban, no con la suposición inicial:

| Camino | Pensamiento | Por qué |
| --- | --- | --- |
| Apuntes (`note`) | `high` | Baja los términos traducidos de forma consistente en las dos pasadas, con un pensamiento medido de ~1.000-1.200 tokens sobre un techo de 4.096: mejora visible y repetida, sin riesgo de tocar el techo. |
| Examen (`test`) | `low` (la decisión 14 original asumía `high`) | `high` revienta el techo de salida (`finishReason: "length"`) en 1 de 3 temas del fixture en las dos pasadas, con un pensamiento que osciló entre 1,7k y 15,7k tokens en el mismo fixture: inestable e impredecible. `low` iguala o mejora a "sin pensamiento" con un pensamiento estable (~100-130 tokens). |
| Juez (respuesta abierta) | `off` (la decisión 14 original asumía "sí") | Ningún nivel mejora el acierto de forma visible sobre "sin pensamiento" (18/18 apagado en español; 17/18 en los tres modos tras traducir), y `high` tuvo una caída real de parseo que "off" no tuvo. |
| Control (`quiz`) | sin pensamiento | Camino de más volumen y de práctica, no de examen real; no se midió con las evals de este tramo (decisión 14 original). |
| Indexación | sin pensamiento | 261 páginas de una tirada del corpus local; transcribir una página no se beneficia de razonar sobre ella (decisión 14 original). |
| Tutor (chat) | sin pensamiento | Fuera del alcance de las evals de este tramo; sigue con la configuración de conversación de antes de la fase 4. |

**Consecuencias.**

- El criterio que decide el pensamiento de un camino es "si no mejora de forma visible en la eval, se
  queda sin pensamiento": el que paga la duda es el coste (tiempo y tokens), no la calidad. Dos de las
  tres suposiciones de la decisión 14 original se revirtieron con datos; es el mecanismo funcionando,
  no una desviación sin cobertura.
- El coste y la latencia por llamada varían mucho entre caminos a propósito: un apunte con `high` cuesta
  más por bloque que un Examen con `low` por pregunta. No hay una única cifra de "coste del tutor".
- Si Gemini cambia cómo reparte tokens de pensamiento, o si el fixture de una eval deja de representar
  el caso real, la tabla se vuelve a medir con las mismas evals; no hace falta rediseñar el mecanismo,
  solo volver a correr `eval:notes`, `eval:assessments --thinking=` y `eval:judge --thinking=` y
  actualizar la fila que cambió.
- Detalle completo de la medición (las dos pasadas, antes y después de traducir), en
  `notes/bitacora.md` (2026-09-01) y en el comentario de `gemini.ts:451-471`.

---

## ADR-027 · Borrar un material se lleva sus derivados por huella, solo cuando es la última referencia

- **Estado:** aceptada
- **Fecha:** 2026-09-01

**Contexto.** ADR-024 dejó el índice cacheado por huella (ADR-011) fuera del borrado: "sigue siendo una
optimización compartida entre ficheros, no algo del usuario". Al probar el cierre de la fase 5 aparecen
dos huecos que esa frase no cubría. Uno, no hablaba de las páginas renderizadas
(`.data/materials/pages/<sha>-<page>.png`, que no existían cuando se escribió) ni del perfil de estudio
(`.data/profile/<materialId>.json`): ninguno de los dos se borra hoy, así que un material borrado deja
huella en dos sitios más además del índice. Dos, Iván pidió explícitamente que borrar limpie estos
derivados, lo que revierte la parte de ADR-024 que los declaraba intocables.

**Opciones consideradas.**

- **Mantener la frase de ADR-024 sin cambios.** Descartada porque es justo la instrucción que Iván
  cambió: un material borrado debe dejar de ocupar sus derivados, no solo su PDF y sus artefactos.
- **Borrar el índice y las páginas cacheadas en cuanto se borra CUALQUIER PDF con esa huella.**
  Descartada: dos ficheros con nombre distinto y bytes idénticos comparten huella y por tanto índice
  (ADR-011). Borrar uno de los dos dejaría al otro sin índice ni páginas, forzando un reindexado caro
  de un material que la persona no tocó.
- **Añadir un contador de referencias explícito por huella.** Descartada por peso: con
  `maxMaterials = 5` calcular a mano, en el momento de borrar, cuántos PDF vivos comparten la huella es
  una operación acotada y barata; mantener un contador aparte es un segundo estado que puede
  desincronizarse del real.

**Decisión.** El perfil de estudio se borra siempre por `materialId` (no se comparte entre materiales,
así que no hay caso de última referencia que comprobar). El índice y las páginas cacheadas por huella
de contenido se borran **solo cuando el PDF que se está borrando era la última referencia viva a esa
huella**: `FileMaterialRepository.remove` calcula la huella antes de borrar el PDF, recorre los PDF
restantes (barato con `maxMaterials` acotado) y, si ninguno más la comparte, borra el índice
(`removeByHash`, nuevo método del puerto) y cada página cacheada cuyo nombre empiece por `<sha>-`. El
PDF se borra el último de toda la cascada: si un paso anterior falla, el material sigue visible y se
puede reintentar (no hay transacción entre los repositorios de ficheros implicados).

**Consecuencias.**

- La frase de ADR-024 que declaraba el índice intocable queda corregida: sigue siendo cierto que
  **compartir** el índice entre dos nombres es gratis y correcto (ADR-011), pero deja de ser cierto que
  borrar nunca lo toca. Ahora lo toca exactamente cuando ya no queda ningún fichero que lo necesite.
- Editar un PDF y deshacer la edición (el caso que ADR-011 quería proteger, huérfanos que "vuelven a
  servir") sigue intacto: esta decisión solo actúa en el borrado explícito de un material desde la
  interfaz, no en el reemplazo de contenido.
- Calcular huellas de los PDF restantes en cada borrado tiene un coste que crece con `maxMaterials`. Con
  el techo actual (5) es insignificante; si el techo subiera mucho, este barrido habría que revisarlo.

---

## ADR-028 · La preparación automática de un material recién subido queda fuera del fusible de concurrencia

- **Estado:** aceptada
- **Fecha:** 2026-09-01

**Contexto.** La fase 4 (decisión 4) ya concedía una gracia de alta a un material recién subido: su
primera indexación y su primera generación de apuntes no cobran el cubo de frecuencia `artifacts`,
porque subir ya se cobró contra `uploadsPerWindow`. Al probar una subida de cinco PDF a la vez, la
gracia resultó incompleta: `NoteGenerationRoute` la aplicaba solo al cubo de frecuencia y seguía
llamando siempre a `acquire`/`release`, el permiso de concurrencia de `maxConcurrentRequests = 3`. El
cuarto y quinto material de un lote de cinco reciben 429 aunque tengan gracia, y su preparación queda
incompleta.

**Opciones consideradas.**

- **Subir `maxConcurrentRequests`.** Descartada: es un fusible global que también protege el chat, la
  reescritura de bloques y la generación manual de pruebas; subirlo para arreglar un caso de subida
  relaja la protección en todos los caminos, no solo en el que falla.
- **Serializar las cinco cadenas de preparación en el cliente.** Descartada por producto: es más lento
  para quien sube sin que la concurrencia real fuera el problema, solo lo era la contabilidad del cupo.

**Decisión.** La gracia de alta exime también del permiso de concurrencia, no solo del cubo de
frecuencia: `NoteGenerationRoute` calcula `usesConcurrencyPermit = !hasGrace` y solo entonces llama a
`check`, `acquire` y `release`, incluido el retorno temprano por apunte ya existente. La gracia se
concede una sola vez, en el POST de subida, y se revoca explícitamente al cerrar el stream de
generación de apuntes, en éxito y en fallo, para que no quede viva más allá de su propósito.
Chat, pruebas manuales y generación de apuntes sin gracia mantienen las dos barreras sin cambios.

**Enmienda (2026-09-02, tras la auditoría de guardarraíles).** La versión inicial renovaba la gracia
al cerrar el stream de indexado, para que un indexado largo no consumiera la ventana antes de los
apuntes. La auditoría lo marcó como fallo ALTO: `grantUploadGrace` fija la caducidad en
`now() + uploadGraceMs` sin tope acumulado, así que un cliente que reindexara en bucle dentro de la
ventana mantenía la gracia viva para siempre y se saltaba el cubo `messages` sin límite. Es el
antipatrón "la seguridad la impone el código, no la conducta del cliente". La renovación se retira:
la ventana se concede una vez en la subida y `uploadGraceMs` sube de 10 a 20 minutos para que cubra,
sin renovar, subir + indexar los cinco en paralelo + arrancar el último apunte (la comprobación de
gracia se evalúa una vez al entrar en la ruta de apuntes, así que basta con llegar a tiempo de
empezar). En el flujo normal la gracia muere antes, cuando la generación de apuntes la revoca.

**Consecuencias.**

- La fila "Peticiones simultáneas por cliente: 3" de la tabla del ADR-007 deja de ser absoluta: queda
  con la excepción explícita de la preparación automática recién subida.
- Cinco preparaciones automáticas pueden seguir agotando un límite del proveedor externo (Gemini) que
  esta exención no toca: cada cadena sigue aislando y mostrando su propio fallo, sin detenerse unas a
  otras ni presentarlo como éxito.
- La gracia sigue acotada por `uploadGraceMs` como caducidad de seguridad (20 min, tras la enmienda,
  y ya sin renovación) y por `uploadsPerWindow` como freno a fabricar gracia a fuerza de subir y
  borrar: esta decisión amplía lo que la gracia exime, no cuánta gracia se puede tener.
- Queda como deuda registrada, no urgente: que el reindexado sin gracia tome también permiso de
  concurrencia (`acquire`), como el resto de operaciones caras. Hoy solo cobra el cubo `messages`.

---

## ADR-026 · Una prueba parcial solo la autoriza una insuficiencia declarada, nunca un error de formato

- **Estado:** aceptada
- **Fecha:** 2026-09-01

**Contexto.** ADR-019 dejó cerrado que "o la prueba sale con las N pedidas o no sale" (decisión 21):
cualquier déficit, sin distinguir su causa, hacía fallar la generación entera. Al probar el cierre de
la fase 5, esa regla castiga igual dos casos que no son lo mismo. Uno, el material de verdad no
sostiene tantas preguntas de un tema concreto (una portada breve, un tema con dos párrafos): el modelo
lo sabe y lo dice, pero antes no había ningún sitio donde guardar esa verdad. Dos, un fallo técnico
(JSON roto, tipo de pregunta inesperado, salida cortada por el techo): esto sigue sin decir nada sobre
si el material da para más, así que tratarlo igual que el caso uno colaría una prueba corta por una
razón que ni el modelo ni el sistema pueden explicar.

**Opciones consideradas.**

- **Mantener el todo-o-nada de ADR-019.** Descartada: es la instrucción que Iván cambió explícitamente
  al revisar el cierre de fase 5, y confunde "el material no da para tanto" (verificable, explicable)
  con "el modelo se cortó" (no dice nada del material).
- **Aceptar cualquier déficit como parcial, sin distinguir la causa.** Descartada: un JSON roto o un
  `finishReason: length` no son una declaración de insuficiencia de contenido; guardar una prueba corta
  por esa razón la presenta como completa hasta que alguien nota que faltan preguntas de un tipo, sin
  ningún mensaje que lo explique (invariante 3).
- **Reintentar indefinidamente hasta conseguir la cifra pedida.** Descartada: un material sin más
  contenido no va a dar más preguntas por reintentar; es gasto de llamadas al modelo sin salida, y
  retrasa un fallo o un guardado que ya se podría resolver.

**Decisión.** El modelo declara la insuficiencia explícitamente, junto con las preguntas que sí puede
sostener (`question-parse.ts`, prompt §6.2 del plan de correcciones): `{"questions":[...],
"insufficientContent":true}`. Solo esa declaración autoriza a cerrar un tema con menos preguntas de las
que pedía su reparto; `AssessmentGenerationService` sigue entonces con los demás temas y guarda al
final lo que haya, con `requestedQuestionCount` (lo pedido) y `questions.length` (lo real) por
separado. Un formato antiguo sin preguntas (`{"insufficientContent":true,"maxPossible":N}`, por si el
modelo no sigue la instrucción nueva) se acepta como compatibilidad defensiva: se le pide una vez esa
cantidad exacta y, si tampoco produce nada, el tema aporta cero sin más reintentos. Un error de formato,
un tipo de pregunta inesperado o una salida cortada (`finishReason: length`) sin esa declaración
mantienen los reintentos existentes y, al agotarlos, hacen fallar la generación completa sin guardar
nada: siguen sin decir si el material da para más. Una parcial con cero preguntas en total tampoco se
guarda: no hay nada que mostrar como prueba.

**Consecuencias.**

- La interfaz muestra `Se pidieron N preguntas; el contenido permitió M.` de forma persistente (al
  terminar, en la lista y al abrir la prueba), nunca como error ni oculto tras recargar: la diferencia
  entre lo pedido y lo real deja de ser invisible.
- Los artefactos guardados antes de este corte no llevan `requestedQuestionCount`: se interpretan como
  completos, con solicitado igual al real (`assessment-shortfall.ts`). No hace falta migrar ficheros.
- El reparto por tipo de una prueba parcial puede no conservar los porcentajes de una completa: se
  guarda solo lo que el material sostiene, sin fabricar preguntas de un tipo para cuadrar el reparto.
- La corrección y la nota se calculan sobre las preguntas que existen, nunca sobre las que se pidieron.

---

## ADR-029 · Una frase de progreso solo se mueve cuando el servidor manda un evento

- **Estado:** aceptada
- **Fecha:** 2026-09-02

**Contexto.** Indexar un PDF, redactar sus apuntes y generar una prueba son las tres esperas largas
del producto: minutos, no segundos. El servidor ya emite progreso estructurado y honesto en las tres
(`indexing-service.ts` con `page`/`pageCount`, `note-generation-service.ts` y
`assessment-generation-service.ts` con `topic`/`topicCount`). Lo que fallaba era la presentación: el
cliente acumulaba cada mensaje en una lista con aspecto de consola, distinta en cada superficie, y la
cola de subida enseñaba además el texto crudo del evento.

La tentación evidente al rehacerlo es rellenar la espera: frases que rotan por tiempo ("casi está",
"ya queda poco"), una barra que avanza sola, un porcentaje estimado antes de conocer el total.

**Opciones consideradas.**

- **Carrusel de frases por tiempo.** Descartada: es exactamente el valor neutro que prohíbe la
  invariante 3 de `AGENTS.md`. La pantalla parecería avanzar mientras el servidor está parado o
  muerto, y el alumno no tendría forma de distinguir una espera larga de una caída.
- **Barra con porcentaje estimado mientras el total es desconocido.** Descartada por lo mismo: un
  porcentaje inventado es un dato falso presentado con la confianza de un dato medido.
- **Componer la frase troceando `event.message`.** Descartada: parsear castellano del servidor es un
  acoplamiento que se rompe en silencio en cuanto alguien cambia una palabra del mensaje.

**Decisión.** La línea de progreso se deriva siempre de un evento real, en lógica pura
(`packages/web/src/domain/progress/progress-line.ts`): fase y contador salen de los campos
estructurados del evento, nunca de su texto. Una sola línea que se sustituye, jamás una lista que
crece, en las cuatro superficies (`GenerationProgress.tsx`). El contador solo existe cuando el total
es mayor que 1, y mientras el total sea desconocido la barra es una banda tenue, no una fracción. El
camino de fallo manda sobre el de progreso: al llegar un `failed`, la línea desaparece y queda el
error con su texto completo; nunca conviven los dos.

**Consecuencias.**

- Se pierde el histórico visible de líneas, que dejaba ver por qué tema pasó una generación. A cambio,
  el fallo sigue enseñando su texto entero y el servidor conserva el suyo en el log. Si al depurar se
  echa de menos, vuelve como detalle plegado, nunca como vista por defecto.
- Se pierde en la interfaz la distinción entre extraer texto y transcribir con el modelo, que viajaba
  dentro del mensaje del indexado. El alumno no pierde ese dato: la marca `transcrito por el modelo`
  sigue en cada página del PDF y en cada cita, que es donde decide si se fía.
- Solo la frase se anuncia a un lector de pantalla; el contador va `aria-hidden`, para que indexar 82
  páginas no dispare 82 anuncios.
- No se toca ningún contrato de `packages/shared`: el dato ya estaba, faltaba la presentación.

---

## ADR-030 · La aplicación solo navega sola cuando el destino es inequívoco y no arranca nada

- **Estado:** aceptada
- **Fecha:** 2026-09-02

**Contexto.** Al terminar de generarse una prueba, el alumno tenía que pulsar `Ver la prueba en la
lista`, buscarla y abrirla; al terminar de prepararse un PDF recién subido, tenía que ir al sidebar,
elegirlo y cambiar de pestaña. Son pasos que no deciden nada: en los dos casos hay un único destino
razonable y el alumno acaba de pedir ese trabajo.

Navegar solo tiene un coste evidente y opuesto: robarle la pantalla a quien está leyendo otra cosa, o
peor, meterlo en un estado que consume algo suyo.

**Opciones consideradas.**

- **No navegar nunca.** Descartada: obliga a repetir a mano un camino que la aplicación conoce, y en
  la generación de pruebas era la fricción que Iván señaló con más claridad.
- **Navegar siempre que termine un trabajo.** Descartada: con dos o más materiales recién preparados
  el destino es ambiguo, y con un examen real la pantalla siguiente crearía el intento y arrancaría el
  reloj sin que nadie lo pidiera.
- **Abrir el examen real directamente en su intento.** Descartada por contradecir F3-39d: el aviso
  previo existe precisamente para que empezar sea una decisión, no una consecuencia.

**Decisión.** Se navega sola solo con destino inequívoco y nunca a un estado que arranque un reloj o
consuma un intento:

- Un Control o un Examen de prueba recién generados se abren en su solver. Un Examen real abre su
  pantalla previa con `initialAttemptId: null`: el intento nace al pulsar `Empezar el examen`. Si la
  generación falla, no se navega a ninguna parte.
- El tipo y el modo que deciden el destino son los que se **pidieron**, no los que responde el
  servidor: `ArtifactSummary` no lleva `mode` y no se amplía un contrato compartido por un efecto de
  interfaz.
- Tras una preparación automática se navega solo si el lote tenía un único PDF y el alumno no ha
  abierto ningún material a mano mientras tanto. El aterrizaje es la pestaña Mapa.
- Al terminar un indexado manual del material que ya está abierto, se cambia a Mapa: mismo criterio,
  destino único y el alumno ya está mirando ese material.

**Consecuencias.**

- El botón `Ver la prueba en la lista` desaparece: ya no hay nada que buscar a mano.
- El aterrizaje reutiliza el patrón que ya existía para las citas (un objetivo que `MaterialPanel`
  consume una sola vez), así que no hace falta router ni estado global de navegación.
- La condición "no hay ningún material abierto" se lee en el momento en que termina la cadena, no
  cuando empezó la subida: quien abre un material mientras se prepara otro conserva su pantalla.
- Si al usarlo la navegación automática de la subida molesta, la salida barata es dejarla solo en la
  generación de pruebas; la de la subida está aislada en un único callback de `App`.

---

## ADR-031 · `Plegar todo` es una orden con marca, no un estado que se recalcula de otras superficies

- **Estado:** aceptada
- **Fecha:** 2026-09-02

**Contexto.** El botón `Plegar todo` / `Desplegar todo` de la cabecera del material (extensión pedida
por Iván sobre F5-51 y F5-52) recoge de una vez tres superficies que hasta entonces se plegaban cada
una por su cuenta: la barra lateral, Sym y, si hay un apunte abierto, su índice de bloques. La primera
implementación calculaba si el índice debía estar plegado mirando si la barra y Sym ya lo estaban
(`sidebarCollapsed && chatCollapsed`).

**Opciones consideradas.**

- **Estado derivado de las otras dos superficies.** Descartada: al probarlo, desplegar solo el rail de
  Sym (sin tocar la barra) volvía a evaluar esa condición a `false` y reabría el índice de bloques
  aunque el alumno no hubiera tocado el apunte. Plegar o desplegar una superficie por separado no puede
  tener efecto sobre las demás.
- **Estado propio del índice sin relación con `Plegar todo`.** Descartada: entonces el botón de la
  cabecera dejaría de plegarlo, que es justo lo que pide la extensión.

**Decisión.** `Plegar todo` emite un mandato (`FoldAllCommand`, en `domain/workspace/layout.ts`):
`{ collapsed, seq }`. `seq` crece en cada pulsación para distinguir dos órdenes iguales seguidas de
ninguna orden. `NoteWorkspace` mantiene su propio `outlineCollapsed` y solo lo sobrescribe cuando
`foldAll.seq` cambia respecto al último que atendió; fuera de eso, el índice de bloques manda sobre su
propio rail sin que nada se lo vuelva a imponer.

**Consecuencias.**

- Plegar o desplegar Sym por su lado (la agarradera) o la barra lateral (su rail) nunca mueve el índice
  de bloques, y viceversa: solo pulsar el botón de la cabecera los mueve a los tres a la vez.
- Con `foldAll` en `null` (apertura inicial, sin ninguna pulsación todavía) el índice arranca
  desplegado, igual que antes de que existiera el botón.
- Cualquier otra superficie que en el futuro se sume a `Plegar todo` sigue el mismo patrón: lee
  `foldAll` y compara `seq`, no deriva su plegado del de sus vecinas.

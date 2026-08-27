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

El umbral se calibra en la fase 1 contra el fixture versionado y queda escrito, no se elige a ojo.

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

**Por qué el techo por llamada no sirve.** El agente tiene 8 pasos por turno y puede llamar a
`materials view` en cada uno. Con un tope de 20 páginas por llamada, un solo mensaje del usuario puede
leer 160 páginas cumpliendo el límite las ocho veces.

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
| | Bytes de imagen | 8 MB |
| | Pasos del agente | 8, **acotado en el servidor** |
| Frecuencia | Mensajes | 20 / 10 min · 200 / día |
| | Artefactos generados | 5 / 10 min · 40 / día |
| | Peticiones simultáneas por cliente | 3 |
| Tamaño de salida | Preguntas por artefacto | 50 |
| | Bloques por nota | 200 |
| Tiempo | Llamada al modelo | 60 s |
| | Fetch de URL externa (fase 2) | https, 5 s, 2 MB, sin IP privada |

Las cifras de esta tabla son la **decisión**; los valores vivos son los de `limits.ts`. Si divergen,
manda el código y este registro se corrige.

**El presupuesto de páginas y de bytes es por turno**, entendiendo turno como un mensaje del usuario y
todo el trabajo que desencadena. Se repone con el siguiente mensaje, y eso es el objetivo, no un efecto
secundario: leer 60 páginas exige tres mensajes, y entre uno y otro hay una persona decidiendo seguir.

**Los bytes se acumulan mientras se renderiza.** Cuando la siguiente página se pasaría del techo, se
para y se devuelve lo que hay **diciéndolo**: "me detuve en la página 14 de 20, las imágenes llegaron a
8 MB". No es recorte silencioso porque el modelo lee el aviso y puede pedir menos.

**Consecuencias.**

- Los 8 MB son un punto de partida, no un dato: **hay que medir el tope real de tamaño de petición de
  la API con `inlineData` en la fase 1** y ajustarlo. Queda como supuesto marcado.
- **Sin autenticación, el limitador de frecuencia es control de coste, no control de acceso.** Solo se
  puede identificar al cliente por IP o por un identificador del navegador, y las dos cosas se cambian
  en diez segundos. Protege de un bucle accidental, de un reintento automático y de una demo abierta el
  fin de semana; no protege de nadie que quiera saltárselo. Es un fusible, no una cerradura, y así se
  escribe en `NOTES.md` en vez de presentarlo como seguridad.
- El tope de preguntas y bloques por artefacto es el que decide si la interfaz de la nota por bloques
  va fluida, así que es un límite de producto además de uno de coste.

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

# Especificación

El **qué**, sin el **cómo**. Los criterios se escriben en notación EARS: con disparador y con
comportamiento medible. Prohibido lo ambiguo ("rápido", "intuitivo", "mejor"): eso no es un criterio,
es un deseo.

**La prueba de que un criterio está bien escrito:** se puede convertir en un caso de la batería de
evaluación. Si no se puede comprobar, está mal escrito.

**Se rellena por fases**, no de una vez: cada fase añade los criterios de lo que construye, y el agente
`invariantes` los comprueba al cerrarla.

## Chuleta EARS

| Patrón | Fórmula | Cuándo |
| --- | --- | --- |
| Ubicuo | EL sistema DEBERÁ ... | Siempre activo |
| Guiado por evento | CUANDO ... EL sistema DEBERÁ ... | Hay un disparador concreto |
| Guiado por estado | MIENTRAS ... EL sistema DEBERÁ ... | Dura mientras dure un estado |
| No deseado | SI ... ENTONCES EL sistema DEBERÁ ... | Condición de error |
| Opcional | DONDE ... EL sistema DEBERÁ ... | Solo si la característica está |

---

## Lo que aquí NO está, a propósito

**Las invariantes de producto viven en [`AGENTS.md`](../AGENTS.md) y no se copian aquí.** Se cumplen en
todas las fases, así que no pertenecen al apartado de ninguna, y una segunda redacción de la misma regla
es la copia que acaba divergiendo de la primera.

Quien las comprueba es la skill `proxus-verifier`, que las lee de `AGENTS.md` directamente en su puerta
de invariantes. Este documento guarda solo lo que es propio de cada fase.

---

## Criterios por fase

Las fases y su alcance están en [`notes/hoja-de-ruta.md`](../notes/hoja-de-ruta.md). Aquí van solo sus
criterios, que escribe la skill `fase` al planificar cada una.

### Fase 1 · El suelo

Plan y procedimiento de prueba de cada criterio: [`notes/plans/fase1-el-suelo.md`](../notes/plans/fase1-el-suelo.md).
Las cifras que aparecen en mayúsculas son claves de `packages/shared/src/limits.ts`, que es su único
domicilio.

#### Límites

- **F1-01.** CUANDO el cliente envíe una petición de chat con `maxSteps` mayor que `maxAgentSteps`, EL
  sistema DEBERÁ rechazarla con 400 sin llamar al modelo, nombrando el techo y el valor recibido.
- **F1-02.** CUANDO el cliente envíe un mensaje de más de `maxMessageCharacters` caracteres, EL sistema
  DEBERÁ rechazarlo con 400, nombrando el techo y la longitud recibida.
- **F1-03.** CUANDO el cliente envíe un historial de más de `maxHistoryMessages` mensajes o de más de
  `maxHistoryCharacters` caracteres, EL sistema DEBERÁ rechazarlo con 400, nombrando el techo y lo
  recibido.
- **F1-04.** CUANDO una selección de páginas resuelva a más de `maxPagesPerTurn` páginas, EL sistema
  DEBERÁ rechazarla nombrando el techo y el número pedido, y NO DEBERÁ renderizar ninguna.
- **F1-05.** MIENTRAS un turno tenga agotado su presupuesto de páginas o de bytes, EL sistema DEBERÁ
  rechazar toda nueva petición de renderizado de ese turno diciendo cuánto queda.
- **F1-06.** CUANDO los bytes acumulados de un turno alcancen `maxTurnImageBytes` a mitad de una lista
  de páginas, EL sistema DEBERÁ devolver las páginas ya renderizadas acompañadas de un aviso que nombre
  la última página servida y el total pedido.
- **F1-07.** CUANDO un cliente supere una ventana de frecuencia, EL sistema DEBERÁ responder 429
  indicando cuánto falta para poder reintentar.
- **F1-08.** MIENTRAS un cliente tenga `maxConcurrentRequests` peticiones en vuelo, EL sistema DEBERÁ
  rechazar la siguiente con 429 en vez de encolarla.
- **F1-09.** EL sistema DEBERÁ declarar en `packages/shared/src/limits.ts` todo techo que aplique, y la
  interfaz DEBERÁ leer de ahí el contador de caracteres del mensaje, sin repetir la cifra.

#### Índice por página

- **F1-10.** CUANDO se indexe una página cuyo texto extraíble alcance `textDensityThreshold` caracteres
  no blancos, EL sistema DEBERÁ indexarla con ese texto, marcar su procedencia como `extracted` y NO
  DEBERÁ llamar al modelo.
- **F1-11.** CUANDO se indexe una página cuyo texto extraíble no alcance el umbral, EL sistema DEBERÁ
  renderizarla, hacérsela leer al modelo y marcar su procedencia como `transcribed`.
- **F1-12.** EL índice DEBERÁ guardar la procedencia de cada página, y la interfaz DEBERÁ señalar de
  forma visible toda página cuya procedencia no sea `extracted`: transcrita por el modelo o fallida.
- **F1-13.** SI la indexación de una página falla, ENTONCES EL sistema DEBERÁ guardarla como no indexada
  con su motivo, y NO DEBERÁ sustituirla por texto vacío ni por contenido de otra página.
- **F1-14.** EL sistema DEBERÁ localizar el índice de un material por la huella `sha256` de su PDF, de
  modo que un contenido modificado NO DEBERÁ encontrar índice, y un mismo contenido renombrado o con
  otra fecha de modificación SÍ DEBERÁ encontrar el suyo sin reindexar.
- **F1-15.** CUANDO termine de indexarse un material, EL sistema DEBERÁ producir su lista de temas, como
  mucho `maxTopicsPerMaterial`, organizados en una jerarquía de como mucho dos niveles, asignar al menos
  un tema a cada página con contenido, y NO DEBERÁ traducir el vocabulario del material al nombrarlos.
- **F1-16.** MIENTRAS un material no esté indexado, EL sistema DEBERÁ decirlo explícitamente en la
  interfaz y en la respuesta del comando, y NO DEBERÁ devolver un índice vacío como si lo estuviera.

#### Página como recurso

- **F1-17.** CUANDO se pida la página N de un material, EL sistema DEBERÁ devolver su renderizado, esté
  el material indexado o no.
- **F1-18.** SI se pide una página fuera del rango del material, ENTONCES EL sistema DEBERÁ responder
  400 nombrando el rango válido, nunca 500.
- **F1-19.** SI se pide un material que no existe, ENTONCES EL sistema DEBERÁ responder 404, nunca 500.
- **F1-20.** EL renderizado DEBERÁ producir una imagen cuyo lado corto sea `renderShortSidePixels`
  píxeles, sea cual sea el tamaño físico de la página del PDF.

#### Tema

- **F1-21.** MIENTRAS el usuario no haya elegido tema (el estado por defecto, al que siempre puede
  volver), EL sistema DEBERÁ seguir la preferencia de color del sistema operativo, tanto al arrancar
  como cuando esa preferencia cambie en caliente.
- **F1-22.** CUANDO el usuario elija un tema explícito, EL sistema DEBERÁ aplicarlo sin recargar,
  conservarlo en la siguiente visita y NO DEBERÁ dejar que un cambio de la preferencia del SO lo pise.
- **F1-23.** EL sistema NO DEBERÁ contener clases de color literales de Tailwind en sus componentes:
  todo color DEBERÁ venir de un token semántico.
- **F1-24.** EL texto DEBERÁ alcanzar contraste AA sobre su fondo (4,5:1 en texto normal, 3:1 en texto
  grande) en los dos temas.

### Fase 2 · Apuntes: el documento vivo

Plan y procedimiento de prueba de cada criterio:
[`notes/plans/fase2-apuntes-vivos.md`](../notes/plans/fase2-apuntes-vivos.md). Las cifras en
mayúsculas son claves de `packages/shared/src/limits.ts`, que es su único domicilio.

#### El apunte por bloques

- **F2-01.** EL sistema DEBERÁ representar todo apunte como una lista ordenada de bloques, cada uno con
  identidad propia, autoría (`tutor` o `student`), marca de énfasis y fuente, o ninguna fuente.
- **F2-02.** CUANDO el alumno guarde un apunte, EL sistema DEBERÁ persistir el orden, el texto, la
  autoría y la marca de cada bloque, y devolver el apunte guardado.
- **F2-03.** SI un apunte guardado supera `maxBlocksPerNote` bloques, ENTONCES EL sistema DEBERÁ
  rechazar el guardado con 400 nombrando el techo y el número recibido, y NO DEBERÁ guardar nada.
- **F2-04.** SI un bloque supera `maxBlockCharacters` caracteres, ENTONCES EL sistema DEBERÁ rechazar el
  guardado con 400 nombrando el techo, la longitud recibida y el bloque afectado, y NO DEBERÁ guardar
  nada.
- **F2-05.** CUANDO el alumno añada, edite, reordene o borre un bloque, EL sistema DEBERÁ reflejarlo en
  la siguiente lectura del apunte sin recargar la página.
- **F2-06.** CUANDO el alumno marque un bloque como importante, EL sistema DEBERÁ guardar esa marca como
  señal propia del bloque, y NO DEBERÁ mezclarla con ninguna otra señal.
- **F2-07.** SI el fichero de un artefacto guardado no se puede decodificar, ENTONCES el listado DEBERÁ
  devolver los demás y nombrar el que falla con su motivo, y NO DEBERÁ fallar entero.
- **F2-08.** EL sistema NO DEBERÁ usar `Effect.orDie` en ningún handler del grupo `artifacts`: todo
  error DEBERÁ estar declarado en `packages/shared` y mapeado a su estado HTTP.

#### Procedencia del bloque

- **F2-09.** CUANDO un bloque declare material y páginas, EL sistema DEBERÁ rellenar su fragmento
  cacheado desde el índice de ese material, y NO DEBERÁ aceptar como fragmento ningún texto propuesto
  por el modelo.
- **F2-10.** SI la cita de un bloque no se puede comprobar contra el índice (material inexistente, sin
  indexar, página fuera de rango o página fallida), ENTONCES EL sistema DEBERÁ guardar el bloque con el
  motivo concreto y la interfaz DEBERÁ mostrarlo, y NO DEBERÁ descartar el bloque ni presentarlo como
  anclado.
- **F2-11.** CUANDO alguna de las páginas citadas tenga procedencia `transcribed`, EL sistema DEBERÁ
  marcar el fragmento como transcripción del modelo y la interfaz DEBERÁ señalarlo.
- **F2-12.** EL fragmento cacheado de un bloque NO DEBERÁ superar `maxSourceExcerptCharacters`
  caracteres, y si se recorta EL sistema DEBERÁ decirlo en el propio bloque.
- **F2-13.** CUANDO el alumno abra la cita de un bloque, EL sistema DEBERÁ mostrar el renderizado de la
  página citada sin sacarle del apunte.
- **F2-14.** CUANDO el tutor ejecute `materials read` sobre páginas de un material indexado, EL sistema
  DEBERÁ devolver el texto indexado de esas páginas con su procedencia, sin renderizar ninguna imagen y
  sin gastar presupuesto de páginas ni de bytes.
- **F2-15.** CUANDO una lectura de índice alcance `maxIndexTextCharactersPerTurn`, EL sistema DEBERÁ
  devolver lo leído hasta ahí acompañado de un aviso que nombre la última página servida y el total
  pedido.
- **F2-16.** SI se pide `materials read` de un material sin indexar, ENTONCES EL sistema DEBERÁ decirlo
  explícitamente y NO DEBERÁ devolver texto vacío.

#### Reescritura de un bloque

- **F2-17.** CUANDO el alumno pida reescribir un bloque, EL sistema DEBERÁ enviar al modelo únicamente
  el texto del bloque y su fragmento cacheado, y NO DEBERÁ renderizar ninguna página ni releer el PDF.
- **F2-18.** CUANDO el modelo devuelva la reescritura, EL sistema DEBERÁ mostrarla junto al texto
  actual, y NO DEBERÁ guardarla hasta que el alumno la acepte.
- **F2-19.** SI el bloque no tiene fragmento cacheado, ENTONCES EL sistema DEBERÁ reescribir solo con el
  texto del bloque y DEBERÁ decir que lo hizo sin fuente.

#### URL externa como fuente

- **F2-20.** CUANDO el alumno añada una URL como fuente, EL sistema DEBERÁ aceptar solo `https`, y
  DEBERÁ rechazar cualquier otro esquema nombrándolo.
- **F2-21.** SI el host de la URL resuelve a una dirección privada, de loopback, de enlace local o no
  enrutable, ENTONCES EL sistema DEBERÁ rechazar la petición nombrando la dirección, y NO DEBERÁ hacer
  ninguna petición a ella.
- **F2-22.** SI la respuesta supera `maxExternalFetchBytes` o tarda más de `externalFetchTimeoutMs`,
  ENTONCES EL sistema DEBERÁ abortarla y DEBERÁ decir cuál de los dos techos se alcanzó.
- **F2-23.** SI la URL responde con una redirección, ENTONCES EL sistema DEBERÁ rechazarla nombrando el
  destino, y NO DEBERÁ seguirla.
- **F2-24.** SI el tipo de contenido no es `text/html` ni `text/plain`, ENTONCES EL sistema DEBERÁ
  rechazarla nombrando el tipo recibido.
- **F2-25.** CUANDO una URL se traiga con éxito, EL bloque resultante DEBERÁ guardar la URL, la fecha de
  la descarga y el fragmento extraído, y la interfaz DEBERÁ mostrarlos.
- **F2-25b.** CUANDO una URL se traiga con éxito, EL sistema DEBERÁ redactar con el modelo un borrador
  del cuerpo del bloque a partir del fragmento extraído, sin alterar ese fragmento; SI la redacción
  falla o la página trae poco texto, ENTONCES EL bloque DEBERÁ nacer vacío y la interfaz DEBERÁ decirlo.

#### Propuestas del tutor

- **F2-26.** CUANDO el tutor proponga añadir, reescribir o borrar un bloque, EL sistema DEBERÁ guardarlo
  como propuesta pendiente y NO DEBERÁ alterar ningún bloque del apunte. Para una reescritura o un
  borrado EL sistema DEBERÁ registrar por su cuenta el texto que el bloque tiene en ese momento (el
  tutor solo aporta el `blockId` y, si reescribe, el texto nuevo), y SI el `blockId` no existe en el
  apunte DEBERÁ rechazar la propuesta.
- **F2-27.** EL sistema NO DEBERÁ exponer al agente ningún comando que acepte, aplique o rechace una
  propuesta.
- **F2-28.** CUANDO el alumno acepte una propuesta, EL sistema DEBERÁ aplicarla y retirarla de las
  pendientes; cuando la rechace, DEBERÁ retirarla sin aplicarla.
- **F2-29.** SI el bloque afectado por una propuesta ha cambiado desde que se propuso, ENTONCES EL
  sistema DEBERÁ rechazar la aceptación con 409, DEBERÁ mostrar el texto que el tutor vio frente al
  actual, y NO DEBERÁ aplicarla.
- **F2-30.** SI un apunte acumula `maxPendingProposalsPerNote` propuestas pendientes, ENTONCES EL
  sistema DEBERÁ rechazar la siguiente nombrando el techo.

#### Interfaz

- **F2-31.** La interfaz DEBERÁ llamar "Apuntes" al artefacto de tipo `note`, y el contrato DEBERÁ
  seguir usando `note`.
- **F2-32.** EL texto de la interfaz DEBERÁ estar en español en todas las pantallas.
- **F2-33.** Toda vista de los apuntes DEBERÁ tener sus cuatro estados: cargando, vacío, error con
  motivo y con datos.

#### El apunte y su material (tramo 2B, tras probar Iván)

- **F2-34.** EL sistema DEBERÁ atar cada apunte a un material mediante `materialId`, y NO DEBERÁ
  permitir más de un apunte por material: el segundo intento de generar uno DEBERÁ rechazarse con
  409 antes de abrir el stream, nombrando el material y el apunte que ya existe, sin crear nada.
- **F2-35.** La interfaz DEBERÁ mostrar el apunte de un material dentro de la vista de ese material, y
  NO DEBERÁ listar los apuntes en la barra lateral de artefactos.
- **F2-36.** CUANDO el alumno pulse "Crear apuntes" en la pestaña Apuntes de un material, EL sistema
  DEBERÁ generar el apunte con una llamada directa (sin pasar por el tutor), emitir el progreso tema a
  tema, y estructurar el apunte con un bloque por cada tema hoja del índice del material, en orden,
  con la cita de las páginas de ese tema. La prosa de cada bloque se redacta a partir del texto
  indexado de esas páginas.
- **F2-37.** CUANDO la generación de un apunte falle a mitad (el modelo, el almacenamiento), la
  pestaña DEBERÁ mostrar el motivo real del fallo, nunca darlo por hecho.
- **F2-38.** CUANDO el alumno borre un apunte, EL sistema DEBERÁ eliminarlo y la vista del material
  DEBERÁ volver a ofrecer la creación de apuntes.
- **F2-39.** EL tutor NO DEBERÁ crear apuntes: `artifacts create` solo acepta quiz y test.

#### El editor de bloque (tramo 2E)

- **F2-40.** CUANDO el alumno edite un bloque del apunte, EL sistema DEBERÁ ofrecerle un editor de
  texto enriquecido: seleccionar texto muestra una barra flotante (negrita, cursiva, enlace y
  convertir el bloque en encabezado, lista, cita, código o tabla) y «/» al principio de una línea abre
  un menú con esos mismos formatos.
- **F2-41.** EL editor de bloque DEBERÁ guardar siempre markdown limpio, sin HTML incrustado: un
  apunte editado, guardado y releído DEBERÁ conservar su markdown, y ningún formato que solo se pueda
  representar con HTML DEBERÁ ofrecerse.

### Fase 3 · El test que enseña

Plan y procedimiento de prueba de cada criterio:
[`notes/plans/fase3-el-test-que-ensena.md`](../notes/plans/fase3-el-test-que-ensena.md). Las cifras en
mayúsculas son claves de `packages/shared/src/limits.ts`, que es su único domicilio. En la interfaz un
`quiz` se llama **Control** y un `test` se llama **Examen**; el contrato sigue usando `quiz` y `test`.

#### Anclaje de la pregunta

- **F3-01.** EL sistema DEBERÁ guardar en cada pregunta su material, sus páginas y el tema del índice del
  que salió, y esa cita la DEBERÁ copiar del índice, NO DEBERÁ aceptar páginas propuestas por el modelo.
- **F3-02.** SI la cita de una pregunta no se puede comprobar contra el índice, ENTONCES EL sistema
  DEBERÁ guardarla con el motivo concreto y la interfaz DEBERÁ mostrarlo, y NO DEBERÁ descartar la
  pregunta ni presentarla como anclada.
- **F3-03.** CUANDO alguna de las páginas citadas por una pregunta tenga procedencia `transcribed`, EL
  sistema DEBERÁ marcarla como transcripción del modelo y la interfaz DEBERÁ señalarlo.

#### Forma de la prueba

- **F3-04.** EL alcance de un Control DEBERÁ ser un tema del índice, y el de un Examen el material
  entero; ambos DEBERÁN guardar el nombre del tema en el momento de generarse.
- **F3-05.** EL número de preguntas y su reparto por tipo los DEBERÁ decidir el código a partir del
  alcance, dentro de `maxQuestionsPerAssessment` y sin superar nunca `maxQuestionsPerArtifact`.
- **F3-06.** CUANDO se pida dos veces una prueba del mismo alcance con el mismo origen y el mismo perfil,
  EL sistema DEBERÁ producir el mismo reparto de temas y tipos, aunque los enunciados difieran.
- **F3-07.** CUANDO el material tenga apunte, EL sistema DEBERÁ usar el texto de los bloques de los temas
  del alcance además del texto indexado, y los bloques marcados como importantes DEBERÁN recibir más
  preguntas que los no marcados.

#### La generación falla en voz alta

- **F3-08.** SI una pregunta devuelta por el modelo no se puede decodificar, ENTONCES EL sistema DEBERÁ
  descartarla nombrando el motivo en el resultado de la generación, y NO DEBERÁ completarla adivinando
  ningún campo.
- **F3-09.** CUANDO termine de generarse una prueba, EL sistema DEBERÁ informar de cuántas preguntas se
  pidieron, cuántas se guardaron y por qué se cayeron las demás.
- **F3-10.** SI no sobrevive ninguna pregunta, ENTONCES EL sistema DEBERÁ fallar la generación con su
  motivo, y NO DEBERÁ guardar una prueba sin preguntas.

#### Modo práctica

- **F3-11.** EN modo práctica EL sistema NO DEBERÁ poner reloj ni penalización, DEBERÁ servir las pistas, y
  DEBERÁ dejar consultar el material y hablar con el tutor mientras se resuelve la prueba. La corrección
  DEBERÁ salir al entregar, igual que en modo examen.
- **F3-12.** MIENTRAS una prueba se está resolviendo, la representación que reciba el navegador NO DEBERÁ
  contener la opción correcta, la respuesta esperada, la rúbrica ni la explicación de ninguna pregunta.
- **F3-13.** EN modo práctica EL sistema NO DEBERÁ aplicar ninguna penalización: la nota mostrada DEBERÁ
  ser la puntuación bruta escalada.

#### Pistas

- **F3-14.** CUANDO el alumno abra la pista de una pregunta, EL sistema DEBERÁ registrarlo en el intento
  antes de mostrarla, y SI el registro falla NO DEBERÁ mostrarla.
- **F3-15.** EN modo examen EL sistema NO DEBERÁ servir ni mostrar ninguna pista, y DEBERÁ rechazar con
  409 toda petición de revelar una.
- **F3-16.** EL número de pistas abiertas DEBERÁ ser una señal propia del perfil, y NO DEBERÁ sumarse a
  la dificultad observada ni convertir una respuesta correcta en incorrecta.
- **F3-17.** EL texto de una pista NO DEBERÁ superar `maxHintCharacters` caracteres, y una pregunta sin
  pista DEBERÁ decirlo en vez de mostrar un desplegable vacío.

#### Modo examen

- **F3-18.** CUANDO el alumno empiece un intento, EL sistema DEBERÁ crearlo en el servidor con su modo y
  su hora de inicio, y EL tiempo límite de un examen lo DEBERÁ derivar del reparto de preguntas mediante
  `examSecondsPerQuestion` y `examReviewSeconds`.
- **F3-19.** MIENTRAS un intento en modo examen esté sin entregar, EL sistema NO DEBERÁ mostrar ninguna
  corrección ni la puntuación de ninguna pregunta.
- **F3-20.** CUANDO se entregue un intento en modo examen, EL sistema DEBERÁ restar por cada fallo de
  pregunta de opciones o de verdadero/falso el valor de un acierto dividido entre el número de opciones
  menos uno, NO DEBERÁ restar nada por una pregunta en blanco, y DEBERÁ escalar la nota a 10 con suelo
  en 0.
- **F3-21.** SI se entrega un intento en modo examen después de su tiempo límite, ENTONCES EL sistema
  DEBERÁ rechazarlo con 409 nombrando el tiempo transcurrido y el límite.
- **F3-22.** LA penalización del modo examen DEBERÁ cambiar únicamente la nota mostrada: el mismo juego
  de respuestas DEBERÁ mover el perfil igual en modo práctica que en modo examen.

#### El juez de las respuestas abiertas

- **F3-23.** CUANDO se corrija una respuesta de desarrollo corto, EL modelo DEBERÁ devolver, criterio a
  criterio de la rúbrica, si la respuesta lo cumple, y EL sistema DEBERÁ calcular la puntuación a partir
  de esos criterios, NO DEBERÁ aceptar una puntuación propuesta por el modelo.
- **F3-24.** SI el juez no puede corregir una respuesta, o su veredicto no se puede decodificar, o no
  devuelve exactamente los criterios de la rúbrica, ENTONCES EL sistema DEBERÁ marcar la corrección como
  sin evaluar con su motivo, y NO DEBERÁ asignarle ninguna puntuación.
- **F3-25.** UNA corrección sin evaluar DEBERÁ verse como tal en la interfaz, NO DEBERÁ contar como
  fallo, y NO DEBERÁ restar de la nota mostrada.
- **F3-26.** SI un intento tiene más preguntas abiertas que `maxJudgeCallsPerAttempt`, ENTONCES EL
  sistema DEBERÁ corregir hasta el techo y dejar el resto sin evaluar nombrando el techo alcanzado.

#### Puntuación

- **F3-27.** LA puntuación de un intento DEBERÁ calcularse sobre todas las preguntas de la prueba, y una
  pregunta sin responder DEBERÁ contar en la puntuación máxima sin sumar puntos ni penalizar.
- **F3-28.** UNA pregunta de varias respuestas correctas DEBERÁ puntuarse con crédito parcial y suelo en
  cero en la nota mostrada, y DEBERÁ contar como acertada en el perfil solo si el conjunto marcado
  coincide exactamente con el correcto.

#### El perfil de estudio

- **F3-29.** CUANDO se corrija un intento, EL sistema DEBERÁ actualizar el perfil de estudio de forma
  determinista, guardando por material y tema la dificultad observada, las pistas abiertas y el énfasis
  como tres señales separadas, y NO DEBERÁ guardar ningún valor que sea suma de dos de ellas.
- **F3-30.** CUANDO se aplique al perfil un intento ya aplicado, EL sistema NO DEBERÁ moverlo.
- **F3-31.** EL tutor DEBERÁ poder leer el perfil y NO DEBERÁ existir ninguna ruta ni comando por el que
  pueda escribirlo, ni directamente ni creando o corrigiendo intentos.

#### Repaso

- **F3-32.** CUANDO se genere una prueba de repaso, EL sistema DEBERÁ concentrar las preguntas en los
  temas con fallos, pistas abiertas o marca de énfasis, y cada pregunta DEBERÁ decir cuál de las tres
  señales la trajo.
- **F3-33.** SI no hay ninguna señal que repasar, ENTONCES EL sistema DEBERÁ decirlo y NO DEBERÁ generar
  una prueba de repaso.

#### El tutor

- **F3-34.** EL tutor NO DEBERÁ crear, responder ni corregir Controles ni Exámenes, y CUANDO se le pida
  uno DEBERÁ remitir a la pestaña "Pruebas" del material.

#### El examen a puerta cerrada

- **F3-35.** MIENTRAS un intento en modo examen esté sin terminar, EL sistema DEBERÁ rechazar con 409
  toda petición al chat del tutor, a las páginas o al índice de un material, al listado y a la lectura de
  artefactos, y a la generación de apuntes o de pruebas, nombrando el intento en curso y cómo salir de
  él; y la interfaz NO DEBERÁ ofrecer ninguna de esas acciones.
- **F3-36.** MIENTRAS un intento en modo examen esté sin terminar, EL sistema DEBERÁ seguir sirviendo la
  prueba que se está resolviendo, ese intento, y su entrega y su cancelación.
- **F3-37.** CUANDO el alumno cancele un intento, o CUANDO se consulte un intento en modo examen cuyo
  tiempo límite ya venció, EL sistema DEBERÁ cerrarlo como abandonado con su motivo y su hora, DEBERÁ
  volver a servir todo lo cerrado por F3-35, y NO DEBERÁ mover el perfil.
- **F3-38.** CUANDO la interfaz arranque habiendo un intento en modo examen sin terminar, DEBERÁ llevar
  al alumno a ese examen con el tiempo que le queda, y NO DEBERÁ dejarle en una pantalla cuyas peticiones
  fallan sin explicación.
- **F3-39.** SI se pierde la conexión, se cierra la pestaña o se cae el navegador durante un intento en
  modo examen, ENTONCES EL sistema NO DEBERÁ cancelarlo: DEBERÁ conservarlo y DEBERÁ permitir retomarlo
  más tarde, sin límite de cuándo.
- **F3-39b.** EL tiempo límite de un intento en modo examen DEBERÁ medirse sobre el tiempo que el alumno
  ha estado conectado a él, NO sobre el tiempo transcurrido, y EL sistema DEBERÁ registrar cada
  interrupción con su duración y mostrarlas en el historial de ese intento.
- **F3-39c.** CUANDO la interfaz arranque habiendo un intento en modo examen sin terminar, DEBERÁ
  ofrecer volver a él o cancelarlo antes que ninguna otra cosa, y esas dos opciones DEBERÁN levantar el
  bloqueo de F3-35; y CUANDO el alumno recargue, cierre o abandone la página con un examen abierto, EL
  sistema DEBERÁ pedirle confirmación.
- **F3-39d.** ANTES de empezar un intento en modo examen, EL sistema DEBERÁ advertir de que el examen se
  puede retomar, de que el reloj solo corre mientras esté dentro, y de que las interrupciones quedan
  registradas.

#### Tamaño de la prueba y techos de acumulación

- **F3-40.** CUANDO el alumno genere una prueba, EL sistema DEBERÁ dejarle elegir cuántas preguntas
  dentro del rango de su tipo (`questionsPerQuiz`, `questionsPerTest`), y SI el número queda fuera del
  rango DEBERÁ rechazarlo nombrando el rango y el valor recibido.
- **F3-41.** EL reparto por tipo de pregunta DEBERÁ mantener sus porcentajes sea cual sea el total
  pedido, y con el mínimo del rango DEBERÁ producir al menos una pregunta de cada tipo del reparto.
- **F3-42.** SI un material alcanza `maxQuizzesPerMaterial` o `maxTestsPerMaterial`, o una prueba alcanza
  `maxPracticeAttemptsPerAssessment` o `maxExamAttemptsPerAssessment`, ENTONCES EL sistema DEBERÁ
  rechazar la siguiente con 400 nombrando el techo, cuántos hay y cómo bajar de él.

#### Discrepar de la corrección

- **F3-43.** CUANDO el alumno discrepe de un criterio de la rúbrica con el que se corrigió su respuesta,
  EL sistema DEBERÁ marcar esa pregunta como sin evaluar con motivo de discrepancia, DEBERÁ retirar su
  aportación al perfil, y NO DEBERÁ contarla como acertada ni cambiar la nota mostrada del intento.

#### La prueba sale completa o no sale

- **F3-44.** CUANDO el alumno pida una prueba de N preguntas, EL sistema DEBERÁ entregarla con
  exactamente N preguntas, o DEBERÁ fallar la generación con su motivo sin guardar nada; NO DEBERÁ
  entregar nunca una prueba con menos preguntas de las pedidas.
- **F3-45.** SI alguna pregunta devuelta por el modelo no se puede decodificar, ENTONCES EL sistema
  DEBERÁ volver a pedir solo las que faltan hasta `maxGenerationRetriesPerTopic` veces antes de fallar,
  y NO DEBERÁ completar ninguna adivinando ningún campo.
- **F3-46.** SI el modelo responde que el material no da para las preguntas pedidas, ENTONCES EL sistema
  DEBERÁ fallar nombrando cuántas sí daba el tema, NO DEBERÁ reintentar, y NO DEBERÁ generar preguntas
  que el material no sostenga.
- **F3-47.** TODA pregunta de opción única y de varias respuestas correctas DEBERÁ tener exactamente
  cuatro opciones, y sus identificadores los DEBERÁ asignar el código por posición: EL sistema NO DEBERÁ
  aceptar del modelo ningún identificador de opción, de criterio ni de pregunta.

### Fase 4 · El agente

_Pendiente._

### Fase 5 · Pulido y prueba

_Pendiente._

---

## Fuera de alcance

Límite duro de lo que se puede construir, tomado de [`CHALLENGE.md`](../CHALLENGE.md) y de las
decisiones tomadas:

- Autenticación y base de datos.
- Frameworks nuevos.
- Cambios cosméticos como aportación principal.
- Herramientas nuevas del agente (ver `docs/decisiones.md`, ADR-004).
- Lo listado en [`extensibilidad.md`](extensibilidad.md), cada cosa con su razón.

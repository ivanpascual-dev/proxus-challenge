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
- **F1-03.** Retirado en la fase 4 (tramo 4C): la sesión pasa a vivir en el servidor y el historial ya
  no llega en la petición de chat (`maxHistoryMessages`/`maxHistoryCharacters` se retiraron de
  `limits.ts`). Lo sustituyen F4-11 y F4-12.
- **F1-04.** CUANDO una selección de páginas resuelva a más de `maxPagesPerTurn` páginas, EL sistema
  DEBERÁ rechazarla nombrando el techo y el número pedido, y NO DEBERÁ renderizar ninguna.
- **F1-05.** MIENTRAS un turno tenga agotado su presupuesto de páginas o de bytes, EL sistema DEBERÁ
  rechazar toda nueva petición de renderizado de ese turno diciendo cuánto queda.
- **F1-06.** CUANDO los bytes acumulados de un turno alcancen `maxTurnImageBytes` a mitad de una lista
  de páginas, EL sistema DEBERÁ devolver las páginas ya renderizadas acompañadas de un aviso que nombre
  la última página servida y el total pedido.
- **F1-07.** CUANDO un cliente supere una ventana de frecuencia, EL sistema DEBERÁ responder 429
  indicando cuánto falta para poder reintentar.
- **F1-08.** MIENTRAS un cliente tenga `maxConcurrentRequests` peticiones ordinarias en vuelo, EL
  sistema DEBERÁ rechazar la siguiente con 429 en vez de encolarla; la preparación automática de un
  material recién subido queda fuera de este contador según C5-02.
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
  mucho `maxTopicsPerMaterial`, organizados en una jerarquía de como mucho dos niveles, y NO DEBERÁ
  traducir el vocabulario del material al nombrarlos; las páginas que no formen una unidad de estudio
  podrán quedar sin tema según C5-04.
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
- **F2-39.** EL tutor NO DEBERÁ crear apuntes: la generación de apuntes es un servicio con su ruta, que
  se dispara desde la pestaña Apuntes (F2-36), no una capacidad del tutor. (Desde la fase 3 el tutor
  tampoco crea Controles ni Exámenes, F3-34: no crea ningún artefacto.)

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
- **F3-06b.** CUANDO se genere una prueba de material de un alcance que ya tiene otras, EL sistema DEBERÁ
  pasarle al modelo los enunciados existentes de ese alcance para empujarlo a variar. DOS pruebas del
  mismo alcance PODRÁN solapar preguntas (iguales o reformuladas), pero NO DEBERÁN tener el mismo
  conjunto entero de enunciados: SI la prueba generada coincide pregunta por pregunta con una
  existente, ENTONCES la generación DEBERÁ fallar diciéndolo, sin guardarla. Una generación de repaso
  NO tiene esta restricción.
- **F3-06c.** EL orden en que una prueba presenta sus preguntas NO DEBERÁ agruparlas por tipo ni por tema;
  DEBERÁ quedar fijado al generarse (sembrado por el identificador de la prueba), de modo que las
  sucesivas lecturas de esa misma prueba lo respeten. DOS pruebas distintas, con identificadores
  distintos, DEBERÁN presentar sus preguntas en órdenes independientes.
- **F3-07.** CUANDO el material tenga apunte, EL sistema DEBERÁ usar el texto de los bloques de los temas
  del alcance además del texto indexado, y los bloques marcados como importantes DEBERÁN recibir más
  preguntas que los no marcados.

#### La generación falla en voz alta

- **F3-08.** SI una pregunta devuelta por el modelo no se puede decodificar, ENTONCES EL sistema DEBERÁ
  descartarla y registrar el motivo en el log del servidor (diagnóstico para quien desarrolla, no cara
  al alumno), y NO DEBERÁ completarla adivinando ningún campo.
- **F3-09.** CUANDO una prueba termine de generarse, las preguntas guardadas DEBERÁN ser todas las
  preguntas válidas que sostenga el material hasta el número pedido. SI el material declara que no da
  para completar el reparto, ENTONCES el sistema DEBERÁ guardar una prueba parcial según C5-05; un fallo
  de formato, red o truncado seguirá fallando según C5-06.
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
- **F3-19b.** EN el panel del Examen real la interfaz NO DEBERÁ mostrar la cita de tema y páginas de las
  preguntas: en ese modo solo se presentan los enunciados y sus opciones. La cita se sigue guardando en
  cada pregunta según F3-01.
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

#### El historial de intentos

- **F3-39e.** LA pestaña "Pruebas" DEBERÁ ofrecer el historial de toda prueba que tenga al menos un
  intento, listándolos por fecha con su modo y su estado. UN intento corregido DEBERÁ poder reabrirse
  entero con las respuestas del alumno y sus correcciones; UNO abandonado DEBERÁ mostrar su motivo de
  cierre y sus interrupciones y NO DEBERÁ corregirse; UNO en curso NO DEBERÁ poder abrirse desde el
  historial.

#### Tamaño de la prueba y techos de acumulación

- **F3-40.** CUANDO el alumno genere una prueba, EL sistema DEBERÁ dejarle elegir cuántas preguntas
  dentro del rango de su tipo (`questionsPerQuiz`, `questionsPerTest`), y SI el número queda fuera del
  rango DEBERÁ rechazarlo nombrando el rango y el valor recibido.
- **F3-41.** EL reparto por tipo de pregunta DEBERÁ mantener sus porcentajes sea cual sea el total
  pedido, y con el mínimo del rango DEBERÁ producir al menos una pregunta de cada tipo del reparto.
- **F3-42.** SI un tema alcanza `maxQuizzesPerTopic` (el techo del Control va por tema, donde va su
  alcance), o un material alcanza `maxTestsPerMaterial` en un modo (prueba o examen se cuentan por
  separado), o una prueba alcanza `maxPracticeAttemptsPerAssessment` o `maxExamAttemptsPerAssessment`,
  ENTONCES EL sistema DEBERÁ rechazar la siguiente con 400 nombrando el techo, cuántos hay y cómo bajar
  de él.

#### Discrepar de la corrección

- **F3-43.** CUANDO el alumno discrepe de un criterio de la rúbrica con el que se corrigió su respuesta,
  EL sistema DEBERÁ marcar esa pregunta como sin evaluar con motivo de discrepancia, DEBERÁ retirar su
  aportación al perfil, y NO DEBERÁ contarla como acertada ni cambiar la nota mostrada del intento.

#### La prueba no inventa para completar

- **F3-44.** CUANDO el alumno pida una prueba de N preguntas, EL sistema DEBERÁ intentar generar N y,
  SI el contenido solo permite M preguntas válidas con `0 < M < N`, ENTONCES DEBERÁ guardar esas M e
  indicar de forma persistente N y M según C5-05; NO DEBERÁ inventar preguntas para alcanzar N.
- **F3-45.** SI alguna pregunta devuelta por el modelo no se puede decodificar, ENTONCES EL sistema
  DEBERÁ volver a pedir solo las que faltan hasta `maxGenerationRetriesPerTopic` veces antes de fallar,
  y NO DEBERÁ completar ninguna adivinando ningún campo.
- **F3-46.** SI el modelo responde que el material no da para las preguntas pedidas, ENTONCES EL sistema
  DEBERÁ conservar las preguntas válidas que sí devolvió, dejar de pedir las que faltan de ese tema y
  NO DEBERÁ generar preguntas que el material no sostenga; SI no sobrevive ninguna pregunta en toda la
  prueba, ENTONCES la generación DEBERÁ fallar sin guardar.
- **F3-47.** TODA pregunta de opción única y de varias respuestas correctas DEBERÁ tener exactamente
  cuatro opciones, y sus identificadores los DEBERÁ asignar el código por posición: EL sistema NO DEBERÁ
  aceptar del modelo ningún identificador de opción, de criterio ni de pregunta.

### Fase 4 · El agente

Plan y procedimiento de prueba de cada criterio: [`notes/plans/fase4-el-agente.md`](../notes/plans/fase4-el-agente.md).
Las cifras en mayúsculas son claves de `packages/shared/src/limits.ts`, que es su único domicilio.

#### Subida de material

- **F4-01.** CUANDO la persona suba uno o más ficheros, EL sistema DEBERÁ aceptar únicamente PDF,
  comprobado por el contenido del fichero y no por su extensión ni por el tipo declarado por el
  cliente.
- **F4-02.** SI un fichero subido no es un PDF válido, ENTONCES EL sistema DEBERÁ rechazarlo nombrando
  el fichero y el motivo, NO DEBERÁ guardarlo, y DEBERÁ seguir procesando los demás ficheros de esa
  misma subida.
- **F4-03.** CUANDO una subida contenga más de `maxFilesPerUpload` ficheros, o un fichero de más de
  `maxUploadBytes`, EL sistema DEBERÁ rechazarla nombrando el techo y lo recibido, antes de escribir
  nada en disco.
- **F4-03b.** CUANDO un fichero subido tenga más de `maxPagesPerMaterial` páginas, EL sistema DEBERÁ
  rechazar ESE fichero nombrando el techo y las páginas que tiene, antes de escribir nada en disco, y
  DEBERÁ seguir procesando los demás ficheros de esa misma subida. El techo se comprueba sobre el
  número de páginas real que reporta `pdfinfo`, nunca sobre el tamaño del fichero: lo que cuesta
  indexar son las páginas por debajo del umbral de densidad, que se renderizan y van al modelo.
- **F4-04.** CUANDO una subida haría pasar el total de materiales de `maxMaterials`, EL sistema DEBERÁ
  rechazarla nombrando cuántos materiales caben y cuántos hay.
- **F4-05.** SI el nombre de un fichero subido coincide con el de un material existente, ENTONCES EL
  sistema DEBERÁ rechazarlo nombrando el conflicto y NO DEBERÁ sobrescribir el material existente.
- **F4-05b.** CUANDO la persona suelte o elija ficheros antes de subirlos, EL sistema DEBERÁ comprobar
  cada uno (tipo real de PDF, nombre duplicado) sin escribir nada en disco y sin que la persona tenga
  que pulsar nada para disparar la comprobación, y DEBERÁ ofrecer el botón de subir solo cuando ningún
  fichero de la zona esté rechazado (cierre de fase 4).
- **F4-06.** CUANDO la persona supere `uploadsPerWindow` subidas en su ventana, EL sistema DEBERÁ
  rechazar la subida con 429 diciendo cuánto falta para poder reintentar.
- **F4-07.** CUANDO una subida termine correctamente, EL sistema DEBERÁ indexar cada material subido y,
  al terminar cada indexado, generar sus apuntes, sin ninguna acción adicional de la persona.
- **F4-08.** MIENTRAS la cadena de alta de un material esté en curso, EL sistema DEBERÁ mostrar en qué
  paso va (subiendo, indexando página N de M, generando apuntes tema N de M) para ese material en
  concreto.
- **F4-09.** SI un paso de la cadena de alta falla, ENTONCES EL sistema DEBERÁ decir qué paso falló y
  para qué material, DEBERÁ conservar lo ya conseguido, y NO DEBERÁ interrumpir la cadena de los demás
  materiales de la misma subida.
- **F4-10.** CUANDO el indexado y la generación de apuntes se disparen por una subida, EL sistema NO
  DEBERÁ descontarlos del cubo de frecuencia de artefactos.
- **F4-10b.** CUANDO la persona borre un material, EL sistema DEBERÁ borrar también su apunte, sus
  controles y sus exámenes con sus intentos, y NO DEBERÁ dejar ningún artefacto apuntando a un material
  que ya no existe.

#### Sesión y conversaciones

- **F4-11.** EL sistema DEBERÁ guardar en el servidor el historial de cada conversación, y NO DEBERÁ
  aceptar mensajes de historial enviados por el cliente en la petición de chat.
- **F4-12.** SI una petición de chat incluye mensajes de historial, ENTONCES EL sistema DEBERÁ
  rechazarla con 400, sin llamar al modelo.
- **F4-13.** CUANDO la persona recargue la página, EL sistema DEBERÁ mostrar la conversación abierta
  completa, con sus mensajes anteriores.
- **F4-14.** EL sistema DEBERÁ permitir listar las conversaciones, abrir una, crear una nueva y borrar
  una, y DEBERÁ nombrar cada una a partir de su primer mensaje sin llamar al modelo.
- **F4-15.** CUANDO el número de conversaciones alcance `maxConversations`, EL sistema DEBERÁ rechazar
  la creación de una nueva nombrando el techo.

#### Observabilidad

- **F4-16.** CUANDO el modelo responda en un paso, EL sistema DEBERÁ registrar en la sesión los tokens
  de entrada, los de entrada servidos desde caché y los de salida de ese paso.
- **F4-17.** SI el modelo o el enrutado de herramientas falla en un paso, ENTONCES EL sistema DEBERÁ
  registrar el error como error del turno y mostrarlo como tal, y NO DEBERÁ presentarlo como una
  respuesta del tutor.
- **F4-18.** CUANDO un turno termine, EL sistema DEBERÁ registrar su coste en tokens de entrada, de
  caché y de salida. Es un dato de logs/servidor, no de interfaz: el alumno NO DEBERÁ verlo en
  pantalla.
- **F4-19.** SI el modelo no devuelve información de consumo, ENTONCES EL sistema DEBERÁ registrar que
  no hay dato, y NO DEBERÁ registrar cero ni ninguna estimación.

#### Coste del contexto

- **F4-20.** CUANDO un turno termine, EL sistema DEBERÁ sustituir las imágenes de página de ese turno
  por su descripción textual (material y páginas), tanto en lo que guarda como en lo que envía al
  modelo en turnos posteriores.
- **F4-21.** EL sistema NO DEBERÁ enviar al modelo ninguna imagen de página de un turno anterior.
- **F4-22.** EL sistema DEBERÁ construir el mensaje de sistema de forma determinista, de modo que dos
  peticiones con el mismo estado produzcan un texto idéntico.
- **F4-23.** EL sistema DEBERÁ incluir en el mensaje de sistema el nombre y la descripción de cada
  skill disponible, y NO DEBERÁ incluir en él ni el texto completo de ninguna skill ni el árbol de
  comandos: el modelo solo conoce un comando después de cargar la skill que lo documenta.
- **F4-23b.** CUANDO el modelo cargue una skill que ya cargó antes en la misma conversación, EL
  sistema DEBERÁ devolver una referencia a la carga anterior en lugar del texto completo, y NO DEBERÁ
  enviar al modelo el cuerpo de una misma skill más de una vez por conversación.

#### Contexto de pantalla

- **F4-24.** CUANDO la persona tenga abierto un material, un artefacto o un bloque, EL sistema DEBERÁ
  proponerlo como contexto del chat, mostrándolo antes de enviar y permitiendo quitarlo.
- **F4-25.** SI la persona quita un elemento del contexto, ENTONCES EL sistema NO DEBERÁ enviarlo al
  modelo en esa petición.
- **F4-26.** EL sistema DEBERÁ enviar el contexto de pantalla solo como identificadores y títulos, y NO
  DEBERÁ incluir en él el contenido del material, del bloque ni del artefacto.
- **F4-27.** CUANDO el contexto de pantalla supere `maxContextRefs` elementos, EL sistema DEBERÁ
  rechazar la petición nombrando el techo.

#### Preguntas de seguimiento

- **F4-28.** CUANDO el tutor termine una respuesta, EL sistema DEBERÁ ofrecer hasta `followUpQuestions`
  preguntas de seguimiento en español, sin realizar ninguna llamada adicional al modelo.
- **F4-29.** SI la respuesta del modelo no contiene un cuerpo validable con exactamente
  `followUpQuestions` preguntas o alguna supera `maxFollowUpQuestionCharacters`, ENTONCES EL sistema
  NO DEBERÁ mostrar ninguna pregunta y NO DEBERÁ completar ni inventar las que falten.
- **F4-29b.** SI el modelo abre el bloque de seguimiento, escribe exactamente
  `followUpQuestions` preguntas válidas hasta el final de la respuesta y omite únicamente el
  delimitador de cierre, ENTONCES EL sistema DEBERÁ recuperar esas mismas preguntas sin inventar
  contenido y mostrarlas mediante el componente de seguimiento.
- **F4-30.** EL sistema NO DEBERÁ mostrar los delimitadores del bloque de seguimiento en el texto de la
  respuesta.

#### Prompt e idioma

- **F4-31.** EL sistema DEBERÁ escribir en inglés toda instrucción dirigida al modelo, y DEBERÁ exigir
  en cada una que el contenido dirigido al alumno se escriba en español.
- **F4-32.** EL mensaje de sistema del tutor DEBERÁ declarar su identidad y alcance, la obligación de
  responder solo con datos obtenidos de un comando, la preferencia por la herramienta antes que la
  prosa, la prohibición de inventar citas y el tratamiento del material como dato y nunca como
  instrucción.
- **F4-33.** CUANDO el modelo reciba texto entre los delimitadores de material del alumno o de contexto
  de pantalla, EL sistema DEBERÁ presentarlo como dato, y el tutor NO DEBERÁ obedecer instrucciones
  contenidas en él.

#### Modelo por camino

- **F4-34.** EL sistema DEBERÁ elegir la configuración del modelo (temperatura, formato de respuesta y
  nivel de razonamiento) según el camino que la invoca, sin consultar a ningún modelo para decidirlo.
- **F4-35.** EL sistema DEBERÁ elegir el nivel de razonamiento de cada camino midiéndolo con las evals
  del propio camino, no por suposición: hoy razonamiento alto en la generación de apuntes, bajo en la
  generación de Exámenes, y ninguno en el juez de respuesta abierta, en la generación de Controles, en
  la indexación ni en el chat del tutor (ADR-025). NO DEBERÁ fijar el nivel de un camino sin volver a
  correr su eval cuando cambie el modelo o el fixture.
- **F4-36.** EL sistema DEBERÁ declarar el techo de tokens de salida **por camino**, dimensionado sobre
  lo que ese camino tiene que producir más su razonamiento, y NO DEBERÁ usar un único techo para todos.
- **F4-37.** SI una llamada al modelo termina por agotar su techo de tokens de salida, ENTONCES EL
  sistema DEBERÁ registrarlo nombrando ese motivo, y NO DEBERÁ presentar el resultado truncado como
  contenido insuficiente del material ni como respuesta completa.

#### Evaluación

- **F4-38.** EL sistema DEBERÁ disponer de una evaluación de la generación de preguntas que mida, sobre
  las mismas preguntas, el acierto **con** el fragmento citado y **sin** él, y DEBERÁ informar de la
  diferencia entre ambas y no solo de una cifra absoluta.
- **F4-39.** EL sistema DEBERÁ disponer de una evaluación de la generación de apuntes que compruebe,
  sin recurrir a otro modelo, qué cifras del apunte no aparecen en su texto fuente, qué términos del
  material aparecen traducidos y qué reglas del prompt se incumplen.
- **F4-40.** CUANDO se decida el nivel de razonamiento de un camino, EL sistema DEBERÁ dejar registrado
  con qué evaluación se decidió y con qué resultado; SI se decidió sin evaluación, ENTONCES DEBERÁ
  registrarse que la comparación fue manual y con cuántas muestras.

#### Fusible de coste del historial

- **F4-41.** EL sistema DEBERÁ medir el tamaño de una conversación con los tokens de entrada reales del
  último paso del último turno guardado, y NO DEBERÁ estimarlo a partir de caracteres.
- **F4-42.** MIENTRAS una conversación no tenga ningún turno guardado con tokens de entrada medidos, EL
  sistema NO DEBERÁ avisar ni rechazar por este fusible.
- **F4-43.** CUANDO el último turno guardado alcance el 75% de `maxConversationHistoryTokens`, EL
  sistema DEBERÁ avisar al terminar ese turno sugiriendo empezar una conversación nueva, sin impedir
  que la conversación siga usándose.
- **F4-44.** SI el último turno guardado de una conversación alcanza `maxConversationHistoryTokens`,
  ENTONCES EL sistema DEBERÁ rechazar el turno siguiente antes de llamar al modelo, nombrando el techo
  y sugiriendo empezar una conversación nueva.

### Fase 5 · El escritorio de estudio

Plan y procedimiento de prueba de cada criterio:
[`notes/plans/fase5-el-escritorio-de-estudio.md`](../notes/plans/fase5-el-escritorio-de-estudio.md).
Cada criterio lleva su prioridad de entrega (P0 a P3, definidas en ese plan) junto al identificador. Un
criterio marcado `deferred` en el cierre no se borra: queda pendiente de la sesión que lo cubre.

#### Escritorio y layout

- **F5-01 · P0.** MIENTRAS no haya material seleccionado, sea el estado inicial o tras cerrar el
  material abierto, EL sistema DEBERÁ mostrar Sym ocupando todo el espacio restante tras el sidebar,
  sin reservar espacio a un material vacío; el sidebar medirá 224px expandido y podrá contraerse según
  C5-13.
- **F5-02 · P0.** CUANDO la persona seleccione un material, EL sistema DEBERÁ mostrar el split
  Material/Sym con Material al 58% y Sym al 42% del espacio restante tras el sidebar.
- **F5-03 · P0.** MIENTRAS la persona arrastre el separador Material/Sym, EL sistema DEBERÁ mantener
  cada panel en al menos 420px y NO DEBERÁ colapsar ninguno a cero; cerrar el material DEBERÁ ser una
  acción explícita, distinta de arrastrar el separador a un extremo.
- **F5-04 · P0.** CUANDO la persona cambie la proporción del split, EL sistema DEBERÁ recordar solo esa
  proporción en almacenamiento local y aplicarla la próxima vez que haya material seleccionado, sin
  persistir contexto, perfil ni contenido educativo.
- **F5-05 · `descartado` (2026-09-02).** CUANDO el viewport esté entre 768px y 1179px, EL sistema DEBERÁ
  mostrar una sola superficie (Material o Sym) a la vez, con un control en cabecera para alternar entre
  ellas.
- **F5-06 · `descartado` (2026-09-02).** CUANDO el viewport sea menor de 768px, EL sistema DEBERÁ
  presentar el sidebar como un drawer modal con foco atrapado, que se cierra con Escape o al seleccionar
  un material.

> F5-05 y F5-06 quedan **descartados**, no diferidos: decisión de Iván del 2026-09-02, el reto se
> entrega para escritorio. No se implementan, no se prueban y no se afirman en el CHANGELOG. Se
> conservan escritos para que el hueco sea visible.

#### Sidebar, subida y avisos globales

- **F5-07 · P0.** EL sidebar DEBERÁ listar únicamente materiales y controles globales (subida, avisos de
  estado, selector de tema), y NO DEBERÁ mostrar apuntes, controles ni exámenes en su listado.
- **F5-08 · P0.** CUANDO la persona elija o suelte varios ficheros en la subida, EL sistema DEBERÁ
  comprobar cada uno sin escribir en disco, permitir retirar cualquiera antes de confirmar y NO DEBERÁ
  habilitar la subida mientras quede alguno en comprobación o rechazado; cerrar el diálogo de subida NO
  DEBERÁ interrumpir una cadena de subida, indexado o apuntes ya iniciada, y reabrirlo DEBERÁ mostrar la
  misma cola con su progreso.
- **F5-09 · P0.** EL sistema DEBERÁ mostrar los avisos de artefacto ilegible como aviso global fuera del
  sidebar de materiales, y NO DEBERÁ mostrar en él la razón cruda del fallo.

#### Chat de Sym

- **F5-10 · P0.** CUANDO la persona pulse Enter sin Shift en el composer y no esté componiendo con IME,
  EL sistema DEBERÁ enviar el mensaje; Shift+Enter DEBERÁ insertar un salto de línea sin enviar.
- **F5-11 · P0.** MIENTRAS la persona escriba en el composer, EL sistema DEBERÁ ajustar su altura
  automáticamente hasta seis líneas y, a partir de ahí, DEBERÁ usar scroll interno propio, sin permitir
  redimensionado manual.
- **F5-12 · P0.** EL sistema DEBERÁ renderizar la respuesta de Sym en Markdown, y SOLO las tablas y los
  bloques de código DEBERÁN tener scroll horizontal propio; el texto normal NO DEBERÁ crear scroll
  anidado.
- **F5-13 · P0.** EL mensaje del alumno DEBERÁ mostrarse en una superficie tenue de ancho máximo 72% sin
  etiqueta de autor, y la respuesta de Sym DEBERÁ mostrarse sobre el lienzo sin tarjeta, con ancho
  máximo de 760px.

#### Actividad del agente

- **F5-14 · P0.** EL sistema DEBERÁ agrupar la actividad de herramientas por turno y presentarla,
  cerrada, como un resumen humano (verbo, contador, estado), y NO DEBERÁ mostrar JSON crudo en ese
  nivel.
- **F5-15 · P0.** CUANDO la persona despliegue un turno, EL sistema DEBERÁ listar sus llamadas y
  resultados en el orden persistido, emparejando cada `tool-call` con el siguiente `tool-result`
  pendiente, y DEBERÁ mostrar `No hay resultado disponible` cuando la secuencia esté incompleta, sin
  inventar un resultado.
- **F5-16 · P0.** SI una herramienta falla dentro de un turno, ENTONCES EL sistema DEBERÁ conservar ese
  estado de fallo al recargar la conversación, y NO DEBERÁ pintarlo como éxito.

#### Contexto adjunto

- **F5-17 · P3.** CUANDO la persona adjunte contexto desde una acción de la interfaz (tema, página,
  bloque, prueba), EL sistema DEBERÁ mostrarlo como chip visible y retirable antes de enviar, y NO
  DEBERÁ enviarlo al servidor hasta que la persona envíe el mensaje.
- **F5-18 · P3.** SI la persona retira un chip de contexto antes de enviar, ENTONCES EL sistema NO
  DEBERÁ incluir esa referencia en la petición.

#### PDF y citas

- **F5-19 · P1.** CUANDO la persona abra un material, EL sistema DEBERÁ mostrar una tira de miniaturas
  que cargue cada una solo al entrar en su viewport, con la página activa resaltada y sincronizada con
  el lector.
- **F5-20 · P1.** CUANDO la persona pulse una cita de apunte o de corrección, EL sistema DEBERÁ cambiar
  a PDF, navegar a la primera página citada y resaltarla; SI la cita no tiene ancla, ENTONCES DEBERÁ
  mostrar el motivo y NO DEBERÁ navegar.
- **F5-21 · P1.** EL sistema NO DEBERÁ generar una petición de página o miniatura por cada página del
  material al abrirlo: solo por las próximas al viewport.

#### Mapa mental

- **F5-22 · P2.** MIENTRAS la persona arrastre el fondo del mapa, EL sistema DEBERÁ desplazar el lienzo
  (pan), y la rueda con ctrl o gesto de zoom DEBERÁ aplicar zoom anclado al cursor, sin scroll de
  documento para recorrer el grafo; CUANDO el mapa tenga el foco y la persona pulse Ctrl+`+`,
  Ctrl+`-` o Ctrl+`0`, ENTONCES EL sistema DEBERÁ ampliar, reducir o encuadrar el mapa y DEBERÁ impedir
  el zoom global del navegador, que seguirá disponible cuando el foco esté fuera del mapa.
- **F5-23 · P2.** CUANDO la persona active un nodo con Enter o Espacio, EL sistema DEBERÁ abrir
  `TopicActionsPopover`, y Escape DEBERÁ cerrarlo devolviendo el foco al nodo.
- **F5-24 · P2.** CUANDO la persona pulse doble clic en el fondo o el control de centrar, EL sistema
  DEBERÁ ajustar la vista para encuadrar el grafo completo con margen, dentro del rango de zoom
  permitido.

#### Apuntes

- **F5-25 · P1.** EL sistema DEBERÁ mantener montado como mucho un editor TipTap a la vez en Apuntes,
  correspondiente al bloque seleccionado.
- **F5-26 · P1.** CUANDO la persona cambie de bloque seleccionado sin guardar, EL sistema DEBERÁ
  conservar el borrador global sin llamar a la API de guardado, y DEBERÁ indicar `Cambios sin guardar`.
- **F5-27 · P1.** CUANDO la persona abra el bloque de apuntes desde un tema del mapa, EL sistema DEBERÁ
  seleccionar el bloque con mayor solape de páginas con ese tema mediante `findBlockForTopic`; SI no
  existe ningún bloque con solape, ENTONCES DEBERÁ abrir Apuntes y mostrar un aviso explícito de que no
  hay bloque vinculado.

#### Pruebas

- **F5-28 · P1.** EL sistema DEBERÁ presentar Controles, Exámenes de prueba y Exámenes reales como tres
  grupos separados con contador y estado vacío propio, conservando la etiqueta de origen `De repaso`
  dentro de su grupo.
- **F5-29 · P1.** MIENTRAS la persona esté en la lista de Pruebas, Sym DEBERÁ conocer solo que está en
  la pestaña `Pruebas`; CUANDO abra el solver o el historial de un Control o Examen de prueba concreto,
  EL sistema DEBERÁ nombrar a Sym el artefacto exacto y si lo está resolviendo o viendo su historial.
- **F5-30 · P1.** CUANDO la persona empiece un Examen real, EL sistema DEBERÁ sustituir el escritorio
  completo (sidebar, cabecera, chat, citas y controles del AppShell), y DEBERÁ restaurarlo al terminar o
  cancelar.

#### Progreso de estudio

- **F5-31 · P2.** MIENTRAS el perfil de un material no tenga señales, el panel de progreso DEBERÁ
  explicar qué acciones empiezan a poblarlo, sin mostrar un perfil vacío como si tuviera datos.
- **F5-32 · P2.** EL panel de progreso DEBERÁ mostrar aciertos, fallos, sin evaluar, en blanco, pistas y
  énfasis como señales separadas, y NO DEBERÁ combinarlas en un porcentaje ni en una nota agregada.
- **F5-33 · P2.** EL sistema DEBERÁ calcular la siguiente acción de estudio siguiendo el orden fallos >
  pistas > énfasis > práctica nueva, mostrando solo el motivo de la señal que decidió la rama, sin sumar
  señales.
- **F5-34 · P0.** SI la carga del perfil o de una página falla, ENTONCES EL sistema DEBERÁ decir
  explícitamente que no hay datos o que la operación falló, y NO DEBERÁ mostrar cero, un porcentaje
  neutro ni una pantalla vacía de éxito.

#### Accesibilidad y rendimiento

- **F5-35 · P2.** EL sistema DEBERÁ permitir recorrer toda la interfaz principal solo con teclado (Tab,
  Shift+Tab, flechas, Enter, Espacio, Escape), con foco visible de 2px y roles/nombres accesibles
  correctos, y DEBERÁ mantener contraste AA al 200% de zoom en ambos temas.
- **F5-36 · P2.** EL sistema NO DEBERÁ re-renderizar PDF ni el editor de Apuntes al escribir en el chat,
  NO DEBERÁ recalcular el layout del mapa en cada `pointermove`, y DEBERÁ mantener como mucho un editor
  TipTap montado.

#### Comunicación y diagnóstico

- **F5-37 · P0.** SI ocurre un error de dominio, de red o un fallo desconocido en cualquier superficie,
  ENTONCES EL sistema DEBERÁ mostrar qué ocurrió, qué queda afectado y qué puede hacer la persona, y NO
  DEBERÁ mostrar `_tag`, `SchemaError`, estado HTTP, stack, ruta local, JSON, id interno, nombre de
  proveedor ni texto crudo de una excepción.
- **F5-38 · P0.** CUANDO ocurra un fallo inesperado, EL sistema DEBERÁ conservar la causa técnica, la
  operación y la superficie en consola o log de servidor, DEBERÁ redactar claves y cuerpos binarios
  antes de registrarla, y NO DEBERÁ repetirla en pantalla.
- **F5-39 · P0.** EL historial de conversaciones DEBERÁ abrirse desde Sym sin alterar el sidebar de
  materiales; la burbuja del alumno DEBERÁ mostrar únicamente lo que escribió, y el contexto interno
  DEBERÁ reaparecer como chips humanos, nunca como el bloque `SCREEN CONTEXT`, delimitadores ni
  identificadores; esto DEBERÁ cumplirse igual al recargar una conversación antigua que durante el
  streaming de una nueva.

#### Contexto estructurado ampliado

- **F5-40 · P3.** CUANDO la persona adjunte una página desde PDF, EL sistema DEBERÁ mostrar el chip
  antes de enviar y permitir retirarlo sin que viaje al servidor; SI adjunta otra página del mismo
  material, ENTONCES DEBERÁ reemplazar la página anterior, y el servidor DEBERÁ validar que la página
  esté dentro del rango del material.
- **F5-41 · P3.** CUANDO una llamada a lectura o vista de material del turno se complete con éxito, EL
  sistema DEBERÁ presentar sus páginas como `Fuentes consultadas`, deduplicadas por material y página,
  tanto durante el streaming como al recargar; una llamada fallida NO DEBERÁ crear fuente, y ninguna
  mención textual de página en la respuesta DEBERÁ convertirse por sí sola en cita.

#### Detalle técnico e identidad

- **F5-42 · P0.** CUANDO la persona despliegue el detalle técnico de una llamada de herramienta, EL
  sistema DEBERÁ mostrarlo abreviado por un techo de caracteres declarado en
  `packages/shared/src/limits.ts`, y NO DEBERÁ mostrar claves, tokens, system prompt, contenido base64
  ni consumo de tokens.
- **F5-43 · P0.** EL sistema DEBERÁ mostrar `Symma` como marca del producto y `Sym` con el descriptor
  `Tutor académico` como identidad del agente en toda la interfaz visible, y NO DEBERÁ mostrar
  `Proxus Tutor`, `Asistente académico`, `Nexo`, `Compañero de estudio` ni `Sesión efímera`.
- **F5-44 · P3.** CUANDO la persona pregunte quién es Sym o dónde está, EL sistema DEBERÁ responder que
  es Sym, el tutor académico dentro de Symma, y DEBERÁ nombrar únicamente la ubicación presente en el
  contexto adjunto (material, página, bloque, pestaña Pruebas, o el Control/Examen de prueba abierto con
  su vista); NO DEBERÁ inventar un intento o una pregunta concreta, y NO DEBERÁ afirmar ubicación alguna
  si la persona retira el chip correspondiente; durante un Examen real NO DEBERÁ existir chat.

#### Progreso de una generación

- **F5-45 · P3.** MIENTRAS se esté indexando un material, redactando sus apuntes o generando una prueba,
  EL sistema DEBERÁ mostrar una sola línea de progreso que se sustituye, con la frase de la fase en
  curso y, SOLO cuando el total sea mayor que uno, su contador de avance; NO DEBERÁ acumular una lista
  de líneas, NO DEBERÁ mostrar una frase que no proceda de un evento recibido del servidor y NO DEBERÁ
  mostrar porcentaje mientras el total sea desconocido.
- **F5-46 · P3.** SI una generación falla o se corta, ENTONCES EL sistema DEBERÁ retirar la línea de
  progreso y mostrar en su lugar el fallo con su texto completo, y NO DEBERÁ dejar visible una frase de
  progreso junto al error.

#### Navegación automática al terminar

- **F5-47 · P3.** CUANDO termine de generarse un Control o un Examen de prueba, EL sistema DEBERÁ
  abrirlo directamente en su solver; CUANDO termine de generarse un Examen real, DEBERÁ abrir su
  pantalla previa SIN crear el intento ni arrancar el reloj; SI la generación falla, ENTONCES NO DEBERÁ
  navegar a ninguna parte.
- **F5-48 · P3.** CUANDO termine la preparación automática de un lote de un único PDF y no haya ningún
  material abierto, EL sistema DEBERÁ seleccionar ese material y mostrarlo en la pestaña Mapa; SI el
  lote tenía dos o más ficheros, SI la persona ya ha abierto un material a mano, o SI la cadena terminó
  en error, ENTONCES NO DEBERÁ cambiar lo que la persona está mirando. CUANDO termine un indexado manual
  del material que ya está abierto, EL sistema DEBERÁ cambiar a su pestaña Mapa.

#### Pantalla previa del examen y editor

- **F5-49 · P3.** LA pantalla previa de un examen DEBERÁ presentar centrados su título, su conteo de
  preguntas y minutos y sus dos acciones, DEBERÁ seguir advirtiendo de las tres cosas que exige F3-39d
  (que se puede retomar, que el reloj solo corre dentro y que las interrupciones quedan registradas), y
  DEBERÁ mostrar el aviso de prueba parcial cuando lo haya.
- **F5-50 · P3.** EL editor de un bloque de apuntes DEBERÁ ofrecer el encabezado H1 en el menú `/` y en
  la barra flotante, DEBERÁ mostrarlo con más cuerpo que el H2, y DEBERÁ conservarlo intacto al guardar
  y volver a abrir el apunte.

#### Separador, plegado de Sym y persistencia de layout

- **F5-51 · P3.** EL separador entre Material y Sym DEBERÁ mostrar una agarradera visible; arrastrarla
  DEBERÁ redimensionar respetando los 420px mínimos de F5-03, y pulsarla sin arrastrar DEBERÁ plegar a
  Sym a un rail de 56px con un control de restaurar y nombre accesible. MIENTRAS Sym esté plegado, EL
  sistema DEBERÁ conservar su borrador, su contexto adjunto y cualquier respuesta en curso, y NO DEBERÁ
  desmontar el chat. CUANDO no haya material seleccionado, NO DEBERÁ ofrecerse el plegado.
- **F5-52 · P3.** EL sistema DEBERÁ persistir en almacenamiento local exactamente la proporción del
  split y los dos estados de plegado (sidebar y Sym), y NO DEBERÁ persistir contexto, perfil,
  conversación ni contenido educativo; SI el almacenamiento local falla o está bloqueado, ENTONCES la
  interfaz DEBERÁ seguir funcionando con los valores por defecto.

#### Plegar todo el escritorio

- **F5-53 · P3.** LA cabecera del material DEBERÁ ofrecer, junto al siguiente paso de estudio, un
  control `Plegar todo` / `Desplegar todo` que alterne su texto y su `aria-pressed` según el estado
  resultante; en un único gesto DEBERÁ plegar o desplegar a la vez la barra lateral, Sym y, si hay un
  apunte abierto, su índice de bloques. Plegar o desplegar por separado cualquiera de esas superficies
  (la agarradera de Sym, el rail de la barra lateral o el rail del índice de bloques) NO DEBERÁ
  arrastrar a las demás ni disparar el gesto de `Plegar todo`.

### Correcciones de cierre de fase 5

Plan y procedimiento de prueba de cada criterio:
[`notes/plans/correciones.md`](../notes/plans/correciones.md). Este corte es independiente del P3
opcional y corrige comportamientos encontrados al probar P0 a P2.

#### Datos derivados y generación

- **C5-01.** CUANDO la persona borre un material, EL sistema DEBERÁ borrar también su perfil de estudio
  y, SI ningún otro PDF conserva la misma huella de contenido, su índice y todas sus páginas renderizadas;
  SI otro PDF conserva esa huella, ENTONCES DEBERÁ mantener las cachés compartidas.
- **C5-02.** CUANDO se suban cinco PDF válidos en un lote, EL sistema DEBERÁ completar para cada uno la
  secuencia subida, indexado y apuntes sin aplicar `maxConcurrentRequests` a esas preparaciones
  automáticas; EL sistema DEBERÁ mantener ese fusible para el chat y las acciones que no procedan de la
  gracia de una subida.
- **C5-03.** CUANDO se añada un segundo lote a la zona de subida, EL sistema DEBERÁ validar el conjunto
  acumulado contra `maxFilesPerUpload`, las plazas restantes de `maxMaterials` y los nombres duplicados;
  SI se supera un techo, ENTONCES DEBERÁ rechazar la incorporación completa nombrando el límite, sin
  recortar la selección en silencio.
- **C5-04.** SI una portada, separador, página final o fragmento aislado no alcanza
  `minTopicSourceCharacters` caracteres no blancos ni constituye una unidad de estudio, ENTONCES EL
  sistema DEBERÁ dejar esas páginas sin tema y NO DEBERÁ crear un bloque de apuntes de relleno para
  ellas.
- **C5-05.** CUANDO una prueba pida N preguntas y el material declare de forma válida que solo sostiene
  M, con `0 < M < N`, EL sistema DEBERÁ guardar M, conservar N como cantidad solicitada y mostrar
  `Se pidieron N preguntas; el contenido permitió M.` al terminar, en la lista y al abrir la prueba.
- **C5-06.** SI faltan preguntas por salida truncada, respuesta indecodificable, error de red o tipo de
  pregunta incorrecto sin una declaración válida de contenido insuficiente, ENTONCES EL sistema DEBERÁ
  aplicar los reintentos existentes y, al agotarlos, fallar sin guardar una prueba parcial.

#### Chat y conversaciones

- **C5-07.** EL historial de conversaciones DEBERÁ listar primero las conversaciones con turnos,
  ordenadas por `updatedAt` descendente, con desempate estable por `createdAt` e id; las conversaciones
  vacías heredadas DEBERÁN aparecer después.
- **C5-08.** MIENTRAS no se haya enviado el primer mensaje, EL sistema NO DEBERÁ crear ni guardar una
  conversación; pulsar `Nueva conversación` o borrar la activa DEBERÁ abrir un borrador local.
- **C5-09.** CUANDO ya existan `maxConversations` conversaciones, EL sistema DEBERÁ mantener visible y
  operable el historial para abrir o borrar existentes; SI falla la creación al enviar el primer
  mensaje, ENTONCES DEBERÁ conservar el texto escrito en el borrador.
- **C5-10.** CUANDO se muestre una respuesta nueva de Sym, EL sistema DEBERÁ revelarla de forma
  progresiva durante como mucho 1,5 segundos; SI la persona prefiere movimiento reducido o la respuesta
  procede del historial, ENTONCES DEBERÁ mostrarla completa de inmediato.
- **C5-11.** EL estado vacío del chat DEBERÁ describir a Sym como tutor que trabaja con materiales,
  apuntes y progreso, y sus tres sugerencias DEBERÁN corresponder a capacidades reales del agente, sin
  ofrecer crear Controles ni Exámenes desde el chat.

#### Interfaz contenida en el viewport

- **C5-12.** CUANDO se abra un tooltip junto a cualquier borde del viewport o dentro de un contenedor
  con `overflow`, EL sistema DEBERÁ mantenerlo completamente visible, sin crear scroll de página, y
  DEBERÁ conservar la asociación accesible con su control por hover y foco.
- **C5-13.** CUANDO la persona contraiga el sidebar global, EL sistema DEBERÁ pasar de 224px a un rail de
  56px, mantener accesibles selección de material, estado de subida y tema mediante iconos con nombre,
  y recordar solo esa preferencia en almacenamiento local.
- **C5-14.** CUANDO la persona contraiga el índice de bloques de Apuntes, EL sistema DEBERÁ pasar de
  240px a un rail de 56px que conserve los bloques numerados y seleccionables, con un recuadro en los
  destacados, más añadir bloque y añadir desde una URL; NO DEBERÁ desmontar el editor, cambiar la
  selección por el propio contraer ni descartar cambios sin guardar.
- **C5-15.** MIENTRAS haya `maxMaterials` materiales, EL control `Subir material` y la entrada de
  ficheros NO DEBERÁN estar visibles ni disponibles; una cadena ya iniciada PODRÁ mantener un control
  de progreso sin capacidad de añadir ficheros.

---

## Fuera de alcance

Límite duro de lo que se puede construir, tomado de [`CHALLENGE.md`](../CHALLENGE.md) y de las
decisiones tomadas:

- Autenticación y base de datos.
- Frameworks nuevos.
- Cambios cosméticos como aportación principal.
- Herramientas nuevas del agente (ver `docs/decisiones.md`, ADR-004).

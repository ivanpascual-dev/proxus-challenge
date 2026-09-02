# Changelog

Cambios **observables** de este trabajo: lo que una persona usando la aplicación nota. Formato basado
en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/), sin numeración de versiones porque esto
es una rama de trabajo y no hay releases.

**Qué entra aquí:** lo que cambia lo que se ve, se puede hacer o se recibe.
**Qué no entra:** refactors internos, tipados, movimientos de fichero, ruido del lockfile, andamiaje
de desarrollo. Eso vive en el historial de git y, si hizo falta explicarlo, en `notes/bitacora.md`.

**Cómo se escribe:** el resultado, no la secuencia de edición. "Las preguntas citan la página del
material" y no "se añadió un campo `source` al esquema y luego se rellenó desde el handler".

---

## Sin publicar

### Añadido

- **Foco visible en toda la interfaz.** Al navegar con teclado, cualquier botón, enlace o campo marca
  con un anillo de 2px dónde está el foco, no solo los tres controles que ya lo tenían.
- **Tema claro y oscuro.** El selector tiene tres opciones: sistema (por defecto), claro y oscuro. En
  "sistema" la aplicación sigue la preferencia del sistema operativo y reacciona si esa preferencia
  cambia; al elegir claro u oscuro la elección se recuerda y no la pisa el sistema.
- **Visor de material.** Al abrir un material se ven todas sus páginas en scroll continuo, como un PDF.
  No hace falta indexarlo para verlo.
- **Indexado desde la web.** Un material sin indexar muestra un botón para indexarlo con el progreso
  página a página, y dice explícitamente que aún no lo está en vez de enseñar un índice vacío.
- **Mapa mental de temas.** Un material indexado incluye un mapa mental de sus temas en dos niveles.
  Se puede arrastrar, ampliar, reducir y volver a centrar; con el foco dentro, Ctrl con `+`, `-` o `0`
  actúa sobre el mapa en vez de cambiar el zoom del navegador. Al pulsar un tema aparece junto al nodo
  un menú para abrir sus apuntes o crear un Control, con navegación completa por teclado. Un selector
  opcional tiñe cada área y deja sus subtemas del mismo color más claro.
- **Marca de procedencia en el visor.** Las páginas que transcribió el modelo, porque no tenían texto
  extraíble, llevan una marca ámbar en la esquina. Las que fallaron al indexarse, una banda roja.
- **Materiales de ejemplo.** `pnpm run seed:demo` copia unos PDFs de prueba para poder usar la
  aplicación sin apuntes propios.
- **Techos del tutor visibles y en voz alta.** El cuadro del chat cuenta los caracteres contra el
  máximo. Pedir más páginas de la cuenta, un mensaje demasiado largo o demasiadas peticiones seguidas
  se rechaza nombrando el techo y lo que se pidió, nunca en silencio.
- **Aviso cuando una conversación con el tutor se hace muy larga.** Al acercarse al techo de historial
  aparece un aviso con un botón para empezar una conversación nueva, sin dejar de poder seguir
  escribiendo; al superar el techo, el mensaje siguiente se rechaza pidiendo lo mismo.
- **Varias conversaciones con el tutor, guardadas.** Una lista lateral junto al chat muestra las
  conversaciones anteriores, deja crear una nueva y borrar las que sobren; cambiar de una a otra
  recupera su historial completo.
- **El chat no crea una conversación hasta que envías el primer mensaje.** Al abrir el chat, pulsar
  "Nueva conversación" (un botón nuevo en la cabecera) o borrar la conversación abierta, queda un
  borrador en blanco que no aparece en el historial. La conversación se guarda al enviar el primer
  mensaje; si ese guardado falla, el texto escrito no se pierde.
- **El tutor propone hasta tres preguntas de seguimiento.** Al final de cada respuesta aparecen, como
  botones, hasta tres preguntas relacionadas con lo que acaba de explicar; pulsar una la envía como si
  se hubiera escrito. Si están las tres y solo falta el cierre técnico, se recuperan; si el contenido
  no permite validar las tres, no aparece ninguna. Los marcadores internos nunca se enseñan.
- **El tutor ve lo que tienes abierto, y se enseña antes de enviar.** Con un material abierto, y su
  apunte o su prueba a la vista, aparece como una etiqueta encima del cuadro de texto; se puede quitar
  con la "×" antes de enviar y solo lleva el título y el identificador, nunca el contenido.
- **Sym sabe en qué pestaña estás, y en qué bloque o prueba.** La etiqueta de contexto dice ahora la
  superficie que tienes delante (PDF, Mapa, Apuntes o Pruebas), el bloque de apuntes seleccionado y la
  prueba abierta con su vista (resolviéndola o su historial). Si le preguntas dónde estás, nombra solo
  eso: nunca un intento ni una pregunta concreta, y nada en absoluto si retiras la etiqueta.
- **Preguntar a Sym por la página que estás leyendo.** El pie del visor de PDF tiene un botón que
  adjunta la página actual como etiqueta y despliega el chat si estaba plegado. Adjuntar otra página
  reemplaza a la anterior, la "×" la suelta de verdad, y salir del PDF la retira sola.
- **Los apuntes se editan por bloques.** Un apunte se abre en un espacio de trabajo donde cada idea es
  un bloque propio: se escribe con formato, se reordena arriba y abajo, se marca como importante, se
  añade y se borra. El título y cada bloque cuentan sus caracteres contra el máximo y el botón de
  guardar se bloquea si alguno se pasa. Al guardar se manda el apunte entero y gana el último que
  guarda.
- **Encabezado H1 ("Título grande") en los apuntes.** El menú de formato de un bloque, con "/" o la
  barra flotante, ofrece ahora un encabezado principal más grande que el H2 existente.
- **Ficheros de apunte ilegibles a la vista.** Si un fichero de artefacto guardado no se puede
  decodificar, la barra lateral lista los demás y avisa del que falla con su motivo, en vez de
  quedarse sin barra lateral.
- **Cada bloque del apunte enseña de dónde salió.** Un bloque que viene del material muestra sus
  páginas, avisa si el texto lo transcribió el modelo, dice el motivo cuando la cita no se puede
  comprobar contra el índice, y despliega la imagen de la página debajo del bloque.
- **Apuntes dentro del material.** Un material indexado tiene una pestaña "Apuntes": si no los tiene,
  un botón los genera mostrando el progreso tema a tema; si ya los tiene, se editan ahí mismo y hay
  un botón para borrarlos y volver a generarlos.
- **Reescribir un bloque del apunte con el tutor.** Cada bloque tiene dos botones, "Más claro" y "Más
  a fondo", que piden al tutor una reescritura hecha solo con ese bloque y su fragmento de origen. La
  propuesta se enseña junto al texto actual y no se guarda hasta que se pulsa "Reemplazar el bloque";
  si el bloque no tenía fragmento de origen, se avisa de que se reescribió sin fuente. Hay que guardar
  el apunte una vez para poder reescribir sus bloques.
- **El tutor propone cambios en los bloques del apunte.** Cuando se le pide añadir, reescribir o
  borrar un bloque, el tutor no lo toca: deja una propuesta pendiente. La pestaña "Apuntes" del
  material las lista con su motivo y un antes/después, y cada una se acepta (pasa a ser un bloque) o
  se descarta. Aparecen en cuanto el tutor las hace, se le pidan desde el chat o desde la pestaña. Si
  el bloque cambió desde que el tutor lo vio, la propuesta se marca como caducada, enseña los dos
  textos y no deja aceptarla. Aceptar está bloqueado mientras haya cambios del apunte sin guardar.
- **Añadir un bloque del apunte desde una URL.** Un botón "Añadir un bloque desde una URL" pide una
  dirección `https`, el servidor descarga la página (rechazando en voz alta las que apuntan a una red
  interna, redirigen, pesan de más, tardan de más o no son texto), guarda un fragmento de la página
  como fuente y redacta un borrador del bloque. Antes de añadirlo se ven el borrador y el fragmento
  extraído; si no se pudo redactar el borrador, el bloque se añade vacío con el fragmento como fuente.
- **Pruebas dentro del material.** Un material indexado tiene una pestaña "Pruebas": se genera un
  Examen del material entero desde su cabecera, o un Control de un tema pulsando el "＋" de ese tema en
  el mapa mental. Se elige el número de preguntas dentro del rango y la generación enseña el progreso
  tema a tema. Cada prueba de la lista dice su alcance, su número de preguntas y su último intento. El
  orden en que la prueba presenta sus preguntas se fija al generarla y no las agrupa por tipo. Pedir
  una prueba que saldría con exactamente las mismas preguntas que otra del mismo alcance se rechaza en
  vez de duplicarla.
- **Practicar una prueba.** Desde la lista, "Practicar" abre la prueba en modo práctica: sin reloj ni
  penalización, con las pistas a mano, el material consultable en las otras pestañas y la corrección al
  entregar (nota sobre 10, puntuación bruta y corrección pregunta a pregunta con su cita). Cada
  pregunta de desarrollo tiene "Esto sí lo dije" para retirar su corrección del perfil.
- **Hacer un Examen real.** Al generar un Examen se elige el modo: "De prueba" (a libro abierto, como
  un Control) o "Real". Un Examen real se lanza con "Empezar el examen" y ocupa la aplicación entera:
  no hay barra lateral, ni pestañas del material, ni chat, solo las preguntas (sin su cita de tema y
  páginas), el reloj y los botones de entregar y cancelar. Antes de empezar hay un aviso de cómo
  funciona: cuántas preguntas y minutos, que el reloj solo corre mientras el examen esté abierto, que
  cada rato fuera queda registrado como una interrupción y que el resto de la aplicación queda cerrado
  mientras dure. El reloj se para al cerrar la pestaña y se retoma donde se dejó; al agotarse, el
  examen se entrega solo. Recargar o cerrar la página con un examen abierto pide confirmación, y al
  volver a abrir la aplicación un diálogo ofrece volver al examen a medias o cancelarlo.
- **Historial de intentos de una prueba.** Cada prueba con al menos un intento tiene "Ver intentos":
  la lista de todos ellos por fecha, con su modo y su resultado. Un intento corregido se reabre entero
  con las preguntas, lo que respondió el alumno, la corrección de cada una con su cita, y el "Esto sí
  lo dije" de las de desarrollo. Un intento cancelado o caducado no se corrige: enseña por qué se
  cerró y, si el examen se interrumpió, cuántas veces y en qué franjas.
- **Prueba parcial cuando el material no da para tanto.** Si al generar un Control o un Examen el
  material no sostiene todas las preguntas pedidas para un tema, la prueba se guarda igual con las que
  sí se pudieron generar y muestra "Se pidieron N preguntas; el contenido permitió M." al terminar, en
  la lista y al abrir la prueba.
- **Borrar un Control o un Examen.** Cada prueba de la lista tiene un botón para borrarla; se avisa de
  que también se pierden sus intentos guardados.
- **Pruebas de repaso.** Al generar un Control o un Examen, si el perfil del material tiene algo que
  repasar (un tema fallado, uno consultado con pista o uno marcado como importante) se puede elegir
  "De repaso" en vez de "Nuevas": las preguntas se concentran en esos temas y cada una dice por qué
  entró ("porque fallaste este tema", "porque abriste una pista", "porque lo marcaste como
  importante"). Si no hay nada que repasar, el interruptor no se ofrece y en su lugar se explica
  cuándo se activará. En el Examen real el motivo de cada pregunta no se muestra.
- **Tu progreso en el material.** La cabecera del material abre un panel lateral que muestra tema a
  tema aciertos, fallos, respuestas sin evaluar o en blanco, pistas abiertas y la marca de
  "importante", cada señal por separado y sin sumarlas. Es solo lectura y se pone al día al entregar
  o discrepar un intento.
- **Siguiente paso recomendado.** La cabecera del material propone una acción concreta a partir de
  señales verificables del material y del perfil, explica el motivo exacto y permite ejecutarla sin
  convertir aciertos, fallos, pistas o marcas de importante en una puntuación mezclada.
- **Un fallo al dibujar un panel ya no deja la página en blanco.** Si la lista de materiales, el panel
  del material o el chat fallan al renderizarse, ese panel muestra un aviso con "Reintentar" y
  "Recargar la página" y los otros dos siguen funcionando. El detalle técnico va a la consola del
  navegador, no a la pantalla.
- **Subir tus propios PDFs.** La barra lateral tiene una zona para arrastrar uno o varios PDFs, o
  elegir un fichero. Cada uno se comprueba solo, sin escribir nada, en cuanto se suelta: un fichero
  que no es un PDF de verdad, o que repite el nombre de un material ya subido, se avisa con su motivo y
  una X para quitarlo. El botón "Subir" solo aparece cuando todo lo que queda en la zona está validado;
  al pulsarlo, cada fichero sube, se indexa y genera sus apuntes en cadena, sin pulsar nada más, con su
  propio progreso (subiendo, indexando página N de M, generando apuntes tema N de M).
- **Borrar un material.** Cada material de la barra lateral tiene un botón para borrarlo. Antes de
  hacerlo se avisa de que también se pierden su apunte, sus controles y sus exámenes con sus intentos,
  y de que no se puede deshacer.
- **Tira de miniaturas en el visor de PDF.** La pestaña PDF tiene una columna izquierda con una
  miniatura por página; la que se está leyendo se resalta sola, sin clic, según lo que se ve en el
  lector. Un campo "Página" salta directo a cualquier página, "Ajustar ancho" y un zoom del 75% al
  150% cambian el tamaño sin volver a pedir la imagen. Ninguna miniatura ni página se pide hasta que
  está a punto de entrar en pantalla.
- **Pulsar una cita de un apunte o de una corrección abre el material en la pestaña PDF** y salta
  directo a la página citada, con un resalte breve. Si la cita no tiene página anclada, lo dice y no
  navega.
- **Los tooltips nunca se cortan contra el borde de la ventana.** Aparezcan donde aparezcan (una
  esquina, un contenedor con scroll, un diálogo), la etiqueta se voltea arriba o abajo y se recoloca
  para caber entera dentro de la pantalla, y se recalcula si se hace scroll o cambia el tamaño de la
  ventana.
- **El panel lateral se puede contraer a un rail.** Un botón lo reduce a una franja de iconos con la
  marca, la subida o su progreso, un icono por material (con su tooltip y su punto de "preparándose")
  y el tema; otro lo devuelve a su ancho. La preferencia se recuerda entre recargas. Borrar un
  material sigue necesitando expandir.
- **El índice de bloques de un apunte se puede contraer a un rail.** Queda una franja con los bloques
  numerados y seleccionables (recuadro en los destacados), más añadir bloque y añadir desde una URL.
  Buscar y borrar necesitan expandir. Contraer no cambia el bloque abierto ni descarta lo que estabas
  escribiendo.
- **Symma tiene marca propia y Sym tiene avatar.** Una "S" bicolor identifica a Symma en la barra
  lateral y en el icono de la pestaña del navegador; un disco con una chispa identifica a Sym en la
  cabecera del chat, en cada respuesta y en el estado vacío.
- **La agarradera del separador entre Material y Sym se ve y se puede pulsar.** Arrastrarla
  redimensiona los dos paneles respetando el mínimo de 420px; pulsarla sin arrastrar (o Enter y
  Espacio con el foco encima) pliega a Sym a un rail de 56px con un botón para restaurarlo. Una
  flecha dentro de la píldora marca hacia dónde se pliega. El borrador del chat, el contexto adjunto
  y una respuesta en curso sobreviven al plegado.
- **Botón `Plegar todo` / `Desplegar todo` en la cabecera del material.** Pegado al siguiente paso de
  estudio, pliega o despliega de una vez la barra lateral, Sym y el índice de bloques del apunte
  abierto; plegar o desplegar una de esas superficies por separado no mueve a las demás.
- **Fuentes consultadas bajo cada respuesta del tutor.** Cuando Sym lee o visualiza páginas de un
  material para responder, aparecen debajo como "Fuentes consultadas": el material y las páginas de
  verdad, con la misma cita navegable de siempre y un aviso si el texto es transcripción del modelo.
  Se ven en directo mientras responde y siguen ahí al recargar la conversación; una llamada que falla
  no crea fuente, y no se inventa una cita a partir de lo que el modelo escribe en la respuesta.

### Cambiado

- **Los botones de acción comparten un lenguaje visual.** Guardar, borrar, cancelar, generar, volver,
  empezar, entregar, aceptar, descartar, subir y reintentar muestran un icono del mismo sistema que el
  resto de la aplicación, una etiqueta clara, la misma tipografía y estados coherentes de hover,
  pulsación, foco y deshabilitado. Los selectores de origen de preguntas y modo de examen usan el
  mismo patrón y distinguen visual y semánticamente la opción activa.
- **Rediseño visual del escritorio de estudio.** Sidebar, chat, apuntes y pruebas comparten un
  lenguaje más plano, con menos esquinas redondeadas y más contraste en la interacción. Los apuntes
  se leen en dos paneles: un índice de bloques a la izquierda y un bloque a la vez a la derecha, con
  el título, "Guardar", "Borrar" y el estado de guardado agrupados en una sola cabecera. El texto del
  bloque se lee con más tamaño y más aire entre líneas. La pestaña Pruebas separa Controles, Exámenes
  de prueba y Exámenes reales en tres grupos con su propio contador.
- **Las páginas del material se renderizan a un tamaño uniforme** (lado corto 1152 px) en vez de a un
  dpi fijo, así una diapositiva y un A4 pesan parecido y se ven igual de nítidos.
- **Toda la interfaz habla español.** El chat (cabecera, sugerencias de inicio, botones, mensajes), la
  barra lateral y las pruebas (enunciados, tipos de pregunta, correcciones, botones) pasan de inglés a
  español, además de la zona de apuntes que ya lo estaba.
- **El tutor ya no crea apuntes.** Los apuntes se generan desde la pestaña "Apuntes" de cada material,
  no pidiéndoselos al tutor en el chat. Si se le piden, remite a esa pestaña.
- **El tutor ya no crea, entrega ni corrige pruebas por el chat.** Pedirle "hazme un test" o
  "corrígeme esto" lleva a la pestaña "Pruebas" del material: solo el alumno, desde ahí, genera
  pruebas y hace intentos que muevan su perfil. El tutor sí las lee para hablar de ellas, y ahora
  también lee el perfil de estudio del material: al recomendar qué repasar nombra la señal concreta
  que trae cada tema ("fallaste este tema", "abriste una pista aquí", "lo marcaste como importante")
  en vez de una nota resumen.
- **El aviso de fichero de artefacto ilegible da un motivo en lenguaje humano** ("no tiene el formato
  de un artefacto válido; puede ser de una versión anterior") en vez del error de esquema crudo. El
  detalle técnico va al log del servidor.
- **Los apuntes viven en su material, no en la barra lateral.** La barra lateral deja de listar los
  apuntes.
- **El tutor entiende "bloque" como bloque del apunte.** Al preguntarle por los bloques, el mapa
  mental o el apunte de un material, el tutor lee el apunte en vez de contar las secciones del PDF, y
  puede leer un bloque concreto para hablar de él.
- **El bloque del apunte se escribe con formato, no en markdown a la vista.** Cada bloque se edita en
  el sitio con un editor de texto enriquecido: al seleccionar texto sale una barra flotante (negrita,
  cursiva, enlace y "convertir en" encabezado, lista, cita, código o tabla) y "/" al empezar una línea
  abre un menú con esos formatos. Las tablas traen su propia barra para añadir y quitar filas y
  columnas. Se van el botón "Editar/Hecho" y el recuadro de markdown; lo que se guarda sigue siendo el
  mismo markdown limpio.
- **Ningún error en pantalla enseña detalle técnico.** Los mensajes de error de la aplicación dicen
  qué ha fallado y qué se puede hacer, sin nombres de fichero, errores de esquema, `_tag` ni "revisa
  el log". El detalle técnico va al log del servidor o a la consola del navegador.
- **Los avisos de límite de frecuencia se leen en lenguaje humano.** Al agotar la ventana corta el
  aviso nombra los minutos que dura; al agotar el tope diario dice que se descanse y se vuelva
  mañana, en vez de hablar en segundos.
- **El historial de conversaciones ordena primero las que tienen mensajes**, de la más reciente a la
  más antigua, y deja al final las conversaciones vacías.
- **Al llegar al máximo de conversaciones, el chat lo avisa antes de escribir.** Una banda sobre el
  cuadro de texto explica que no se pueden crear más y lo bloquea, en vez de dejar escribir un mensaje
  que fallaría al enviarse; el historial sigue disponible para borrar alguna y volver a escribir.
- **El estado vacío del chat presenta a Sym como tutor de tus materiales, apuntes y progreso**, con
  tres sugerencias que el tutor puede cumplir de verdad, ninguna de ellas crear Controles ni Exámenes.
  Si todavía no has subido ningún material, lo recuerda con una línea.
- **El chat de Sym agrupa cada turno en vez de listar mensajes sueltos.** La burbuja del alumno, la
  actividad del agente y la respuesta (o el fallo) viajan juntas. La actividad aparece resumida y
  colapsada ("Consultando el material · 2 pasos · Hecho") solo cuando el turno usó alguna
  herramienta; abierta, cada paso tiene una etiqueta humana ("Leyendo el material") y un segundo
  nivel con el detalle técnico, con las claves, tokens y bloques largos ya filtrados. El historial de
  conversaciones deja de ser una columna fija y se abre desde un icono en la cabecera del chat.
- **La pestaña del navegador dice "Symma"** en vez de "Proxus Tutor".
- **Al llegar al máximo de 5 materiales desaparece la opción de subir.** Si aún queda una preparación
  automática en marcha se ve un control de solo progreso; en cuanto termina, desaparece también.
- **Añadir una nueva selección de ficheros que no cabe con los que ya están en cola se rechaza entera**,
  explicando cuántos se recibieron, cuántos caben y el máximo de materiales. Los que ya estaban en cola
  no se tocan.
- **La respuesta nueva de Sym se revela progresivamente.** El texto de la última respuesta aparece en
  bloques durante como mucho segundo y medio en vez de salir de golpe; el historial anterior y, si el
  sistema pide movimiento reducido, también la respuesta nueva, se muestran completos al instante.
- **Las tres zonas del escritorio se distinguen por su fondo.** La barra lateral y Sym van sobre una
  superficie y el material sobre otra un escalón por debajo, con una sombra muy tenue en el borde de
  la barra lateral, en vez de separarse solo con una línea.
- **El progreso de indexar, generar apuntes, generar una prueba o subir un fichero se ve en una sola
  línea que avanza**, no en una lista que crece. La línea dice la fase y, cuando hay más de un
  elemento, el contador (página N de M, tema N de M); si falla, desaparece y queda solo el aviso de
  error.
- **Generar un Control o un Examen de prueba abre directamente su solver**, y un Examen real abre su
  pantalla previa sin crear el intento ni arrancar el reloj, sin tener que ir a buscarlo a la lista.
  Subir un único PDF sin tener otro material abierto lo deja seleccionado y en la pestaña Mapa en
  cuanto termina de prepararse; indexar a mano el material que ya tienes abierto hace lo mismo.
- **La pantalla previa al examen real se rediseña.** Queda centrada y los cuatro avisos (sin pistas,
  el reloj solo corre dentro, cada salida se registra, el resto de la aplicación queda cerrado) se ven
  en tarjetas con icono en vez de en una lista de puntos.

### Corregido

- **La nota de un intento de examen se redondea a dos decimales.** Antes se enseñaba con todos los
  decimales del cálculo (p. ej. 7.777777...).
- **Las insignias de estado se leen en el tema claro.** "Sin indexar", "transcrito por el modelo" y
  las marcas de acierto usaban un color que sobre su fondo claro no llegaba al mínimo de contraste.
- **La pestaña "Pruebas" ya no se cae por un intento antiguo en disco.** Si un fichero de intento
  guardado tiene un formato de una versión anterior, se ignora y se registra en el log del servidor;
  la lista de pruebas y sus últimos intentos se carga igual, en vez de romperse entera.
- **Escribir en una respuesta corta o renombrar unos apuntes ya no deja la página en blanco.** El
  campo leía su valor demasiado tarde y la excepción tumbaba toda la vista.
- **Los temas marcados como importantes reciben más preguntas al generar una prueba.** El reparto ya
  pesaba el énfasis, pero la generación no le pasaba qué temas estaban marcados, así que la marca no
  cambiaba nada. Ahora un tema marcado pesa el doble en el reparto.
- **El tutor ya no se atasca leyendo un material que solo conoce por el contexto de pantalla.** Al
  faltarle el número de páginas pedía la lectura sin rango y el comando la rechazaba. Ahora pide
  directamente el máximo de páginas permitido; si el material tiene menos, el propio comando le dice
  cuántas tiene y responde con el contenido en la misma llamada.
- **Subir más ficheros de la cuenta ya no responde con un error genérico.** Una tanda por encima del
  máximo permitido, o un fichero por encima de su tamaño, terminaba en un error sin motivo. Ahora se
  rechaza nombrando el techo real y cuántos se enviaron, igual que el resto de rechazos de la subida.
- **Borrar un material ya no deja intentos huérfanos de sus controles y exámenes.** Se borraban el PDF
  y sus artefactos, pero los intentos guardados de esos artefactos se quedaban apuntando a un artefacto
  que ya no existía. Ahora se borran con el resto.
- **Generar un apunte o una prueba avisa cuando el modelo se corta a media respuesta**, en vez de leerse
  como "el tema no daba para tanto" o entregarse con el bloque incompleto sin decirlo.
- **El chat conserva los saltos de línea que escribes.** Un mensaje escrito con Shift+Enter en varias
  líneas se guardaba bien, pero la burbuja del alumno lo enseñaba fundido en una sola línea.
- **Subir varios PDF a la vez ya no falla en el cuarto o quinto material.** La preparación automática
  (indexar y generar apuntes tras subir) competía por el mismo cupo de peticiones simultáneas que el
  chat y las pruebas manuales; ahora queda fuera de ese cupo, como ya pasaba con el límite de
  frecuencia.
- **Borrar un material también borra su perfil de estudio**, y su índice y las páginas ya renderizadas
  cuando ningún otro material conserva el mismo contenido. Antes solo se borraban el PDF y sus
  artefactos.
- **El índice ya no crea temas de portadas, separadores o páginas sin contenido de estudio.** Esas
  páginas quedan sin tema y ya no generan un bloque de apuntes de relleno ("no tiene apenas texto...").
- **Rechazar la generación de una prueba (rango de preguntas, tope alcanzado, material sin indexar) ya
  muestra el motivo real** en vez de un mensaje genérico.
- **Las sugerencias del chat vacío ya no se salen al estrechar el panel de Sym.** Se apilaban según el
  ancho de la ventana, no el del panel, así que al reducir Sym el texto largo de cada tarjeta
  desbordaba. Ahora se apilan según el ancho real del panel.
- **Abrir o cerrar un material ya no vacía la conversación con Sym de la pantalla.** El chat cambiaba
  de rama del árbol de la interfaz al abrir o cerrar el material, así que se desmontaba y volvía a
  mostrarse como un borrador en blanco; se notaba, por ejemplo, al pulsar una fuente consultada sin
  material abierto. Ahora el chat vive siempre en el mismo hueco y solo cambia cómo se pinta.
- **Ctrl + rueda sobre el mapa mental ya no amplía también la página del navegador**, y recorrer el
  mapa con la rueda deja de llenar la consola de avisos.

### Eliminado

- **La barra lateral ya no resuelve quizzes ni tests.** Se van las secciones "Quizzes" y "Tests" y el
  espacio de trabajo donde se respondían. La barra lateral se queda con los materiales y el aviso de
  ficheros de artefacto ilegibles; las pruebas se generan y se resuelven en la pestaña "Pruebas" de
  cada material.

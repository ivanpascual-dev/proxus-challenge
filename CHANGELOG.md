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

- **Tema claro y oscuro.** El selector tiene tres opciones: sistema (por defecto), claro y oscuro. En
  "sistema" la aplicación sigue la preferencia del sistema operativo y reacciona si esa preferencia
  cambia; al elegir claro u oscuro la elección se recuerda y no la pisa el sistema.
- **Visor de material.** Al abrir un material se ven todas sus páginas en scroll continuo, como un PDF.
  No hace falta indexarlo para verlo.
- **Indexado desde la web.** Un material sin indexar muestra un botón para indexarlo con el progreso
  página a página, y dice explícitamente que aún no lo está en vez de enseñar un índice vacío.
- **Mapa mental de temas.** Un material indexado se abre en dos pestañas, el PDF y un mapa mental de sus
  temas en dos niveles. Al pulsar un tema se salta a su página. Un botón "Colores por grupo" tiñe cada
  área y deja sus subtemas del mismo color más claro.
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
- **Los apuntes se editan por bloques.** Un apunte se abre en un espacio de trabajo donde cada idea es
  un bloque propio: se escribe con formato, se reordena arriba y abajo, se marca como importante, se
  añade y se borra. El título y cada bloque cuentan sus caracteres contra el máximo y el botón de
  guardar se bloquea si alguno se pasa. Al guardar se manda el apunte entero y gana el último que
  guarda.
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
- **Pruebas de repaso.** Al generar un Control o un Examen, si el perfil del material tiene algo que
  repasar (un tema fallado, uno consultado con pista o uno marcado como importante) se puede elegir
  "De repaso" en vez de "Nuevas": las preguntas se concentran en esos temas y cada una dice por qué
  entró ("porque fallaste este tema", "porque abriste una pista", "porque lo marcaste como
  importante"). Si no hay nada que repasar, el interruptor no se ofrece y en su lugar se explica
  cuándo se activará. En el Examen real el motivo de cada pregunta no se muestra.
- **Tu progreso en el material.** La pestaña "Pruebas" tiene un bloque desplegable, plegado por
  defecto, que muestra tema a tema lo que llevas de este material: aciertos, fallos, respuestas sin
  evaluar o en blanco, pistas abiertas y la marca de "importante", cada señal por separado y sin
  sumarlas. Es solo lectura y se pone al día al entregar o discrepar un intento.
- **Un fallo al dibujar un panel ya no deja la página en blanco.** Si la lista de materiales, el panel
  del material o el chat fallan al renderizarse, ese panel muestra un aviso con "Reintentar" y
  "Recargar la página" y los otros dos siguen funcionando. El detalle técnico va a la consola del
  navegador, no a la pantalla.
- **Subir tus propios PDFs.** La barra lateral tiene una zona para arrastrar uno o varios PDFs, o
  elegir un fichero. Cada uno sube, se indexa y genera sus apuntes en cadena, sin pulsar nada más, con
  su propio progreso (subiendo, indexando página N de M, generando apuntes tema N de M). Un fichero
  que no es un PDF de verdad, o que repite el nombre de un material ya subido, se rechaza nombrando el
  motivo, sin tumbar a los demás de la misma tanda.
- **Borrar un material.** Cada material de la barra lateral tiene un botón para borrarlo. Antes de
  hacerlo se avisa de que también se pierden su apunte, sus controles y sus exámenes con sus intentos,
  y de que no se puede deshacer.

### Cambiado

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

### Corregido

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

### Eliminado

- **La barra lateral ya no resuelve quizzes ni tests.** Se van las secciones "Quizzes" y "Tests" y el
  espacio de trabajo donde se respondían. La barra lateral se queda con los materiales y el aviso de
  ficheros de artefacto ilegibles; las pruebas se generan y se resuelven en la pestaña "Pruebas" de
  cada material.

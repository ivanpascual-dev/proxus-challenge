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

### Cambiado

- **Las páginas del material se renderizan a un tamaño uniforme** (lado corto 1152 px) en vez de a un
  dpi fijo, así una diapositiva y un A4 pesan parecido y se ven igual de nítidos.
- **El espacio de trabajo de artefactos habla español.** Los textos de la zona de apuntes, quizzes y
  tests (encabezados, estados de carga y de error) pasan de inglés a español.
- **El tutor ya no crea apuntes.** Los apuntes se generan desde la pestaña "Apuntes" de cada material,
  no pidiéndoselos al tutor en el chat. Si se le piden, remite a esa pestaña. El tutor sigue creando
  quizzes y tests.
- **El aviso de fichero de artefacto ilegible da un motivo en lenguaje humano** ("no tiene el formato
  de un artefacto válido; puede ser de una versión anterior") en vez del error de esquema crudo. El
  detalle técnico va al log del servidor.
- **Los apuntes viven en su material, no en la barra lateral.** La sección "Artifacts" de la barra
  lateral pasa a llamarse "Quizzes y tests" y deja de listar los apuntes.
- **El tutor entiende "bloque" como bloque del apunte.** Al preguntarle por los bloques, el mapa
  mental o el apunte de un material, el tutor lee el apunte en vez de contar las secciones del PDF, y
  puede leer un bloque concreto para hablar de él.
- **El bloque del apunte se escribe con formato, no en markdown a la vista.** Cada bloque se edita en
  el sitio con un editor de texto enriquecido: al seleccionar texto sale una barra flotante (negrita,
  cursiva, enlace y "convertir en" encabezado, lista, cita, código o tabla) y "/" al empezar una línea
  abre un menú con esos formatos. Las tablas traen su propia barra para añadir y quitar filas y
  columnas. Se van el botón "Editar/Hecho" y el recuadro de markdown; lo que se guarda sigue siendo el
  mismo markdown limpio.

### Corregido

- **Las insignias de estado se leen en el tema claro.** "Sin indexar", "transcrito por el modelo" y
  las marcas de acierto usaban un color que sobre su fondo claro no llegaba al mínimo de contraste.

### Eliminado

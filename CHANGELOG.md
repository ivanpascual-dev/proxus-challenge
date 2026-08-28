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

- **Tema claro y oscuro.** La aplicación arranca en el tema que indica el sistema operativo y se puede
  cambiar con un conmutador. La elección se recuerda en la siguiente visita.
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

### Cambiado

- **Las páginas del material se renderizan a un tamaño uniforme** (lado corto 1152 px) en vez de a un
  dpi fijo, así una diapositiva y un A4 pesan parecido y se ven igual de nítidos.

### Corregido

### Eliminado

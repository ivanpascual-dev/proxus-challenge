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

- **F1-21.** CUANDO el sistema operativo declare una preferencia de color y el usuario no haya elegido
  tema, EL sistema DEBERÁ arrancar en el tema que esa preferencia indique.
- **F1-22.** CUANDO el usuario cambie el tema, EL sistema DEBERÁ aplicarlo sin recargar y conservarlo en
  la siguiente visita.
- **F1-23.** EL sistema NO DEBERÁ contener clases de color literales de Tailwind en sus componentes:
  todo color DEBERÁ venir de un token semántico.
- **F1-24.** EL texto DEBERÁ alcanzar contraste AA sobre su fondo (4,5:1 en texto normal, 3:1 en texto
  grande) en los dos temas.

### Fase 2 · Apuntes: el documento vivo

_Pendiente._

### Fase 3 · El test que enseña

_Pendiente._

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

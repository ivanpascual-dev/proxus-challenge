# NOTES

> Entrega del reto. Se escribe **sobre la marcha**, al cerrar cada fase, no la noche de antes.
> Un `NOTES.md` escrito al final se escribe mal: se olvidan las razones y quedan los resultados.

---

## 1. El problema que elegí

**Nada está conectado con nada.**

El artefacto no sabe de qué material nació: en las 244 líneas que describen todo el modelo de estudio
no aparece la palabra "material" ni una vez. El intento no vuelve al agente: respondes, sacas nota y
ahí muere. Y la interfaz no está conectada con el chat: la aplicación sabe perfectamente qué estás
mirando y no se lo cuenta al tutor, porque el contrato del chat no tiene dónde ponerlo.

Para el alumno eso se ve en dos cosas. **No puede comprobar nada**: la pregunta salió de un PDF suyo y
no hay forma de volver a la página. Y **el tutor no aprende nada**: responde igual de bien la primera
vez que la décima.

**La tesis, en una frase:** cada pregunta sabe de qué página de tus apuntes salió, y cada respuesta
cambia lo que el tutor te propone después.

**Por qué un problema y no cinco.** Mejorar los tests, dar contexto al agente, rediseñar las notas y
arreglar la experiencia parecen cuatro trabajos distintos. Son cuatro sitios donde falta la misma
conexión. Atacar la conexión arregla los cuatro; atacarlos por separado da cuatro parches que no se
sostienen entre sí. Los hallazgos del recorrido por el código son todos caras del mismo hueco.

---

## 2. Cómo lo resolví

<!-- Se rellena al cerrar cada fase. Una sección por pieza, y cada una responde a tres cosas:
     qué problema resuelve, qué decisión se tomó, y qué se descartó y por qué.
     Los trade-offs van aquí dentro, no en un apartado separado: un trade-off suelto de su decisión
     no se entiende. -->

### Índice del material

**Qué problema resuelve.** El tutor releía el PDF entero en cada turno y ninguna pieza podía decir de
qué página salía una afirmación. Sin techos, `materials view apuntes 1-1000` renderizaba mil páginas y
`maxSteps` lo elegía el cliente.

**Qué se construyó.**

- Cada material se indexa página a página por el camino más barato que la sirva: si `pdftotext` saca
  600 caracteres no blancos o más, ese texto es el índice (`extracted`); si no, se renderiza la página
  y la lee el modelo (`transcribed`). El umbral cae en mitad de un hueco medido en el corpus, no se
  elige a ojo (ADR-001).
- El índice se archiva por `sha256` del contenido del PDF, no por su nombre: renombrar un PDF sale
  gratis, editarlo obliga a reindexar, y no existe el estado "índice caducado" (ADR-011).
- Al terminar, una sola llamada al modelo produce los temas del material, en un árbol de dos niveles
  para poder pintarlos como mapa mental. Lo que devuelve el modelo se sanea antes de archivarlo:
  referencia colgante, ciclo o tercer nivel se corrigen (ADR-012).
- Todos los techos del tutor viven en `packages/shared/src/limits.ts` y se imponen en el servidor, no
  en el cliente: caracteres por mensaje, páginas por turno, bytes de imagen por turno (12 MB, contando
  base64), `maxSteps` y frecuencia de peticiones.
- La procedencia viaja en el índice y se ve en el visor: una marca ámbar en las páginas que transcribió
  el modelo, una banda roja en las que fallaron. El texto indexado no se enseña como verdad; se enseña
  la página (invariante 8).

**Qué se descartó.**

- **Un dpi fijo para renderizar.** Producía imágenes de tamaño radicalmente distinto según el tamaño
  físico de la página y pagaba bytes que Gemini descarta antes de mirar. El lado corto a 1152 px es una
  regla que sirve para diapositiva y A4, ahorra el 57 % en diapositivas y no pierde un píxel visible
  (ADR-010).
- **Identificar el material por su contenido.** Ese id viaja dentro de cada cita de las fases 2 y 3;
  corregir una errata en una página cambiaría el id y dejaría huérfanas todas las citas. El nombre para
  el id, el hash para el índice (ADR-011).
- **Cerrar ya el agujero del `tool-result` que fabrica el cliente.** Se cierra en la fase 4 con la
  sesión en servidor; taparlo ahora dejaría al modelo sin el contexto de lo que devolvieron las
  herramientas en turnos anteriores. La batería de ataques lo enseña fallando a propósito (decisión 9
  del plan de la fase).

### Citas verificables

_Pendiente: fase 2._

### Perfil de estudio y práctica adaptativa

_Pendiente: fase 3._

### Errores tipados en el transporte

_Pendiente: fase 2._

### Notas por bloques

_Pendiente: fase 4._

---

## 3. Cómo probarlo a mano

<!-- Tiene que poder seguirlo alguien que no ha visto el repo, en orden, sin saltarse nada.
     Material concreto, comando concreto, y qué se tiene que ver en pantalla. -->

**Requisitos:** Node, pnpm, Poppler (`pdfinfo`, `pdftoppm` y `pdftotext` en el PATH) y `GOOGLE_GENERATIVE_AI_API_KEY`
en `.env`. El servidor falla al arrancar si falta alguno, a propósito.

**Datos de prueba:** `pnpm run seed:demo` copia los materiales de ejemplo versionados en
`packages/server/fixtures/`. No hacen falta apuntes propios para probarlo.

### Recorrido de la fase 1

1. `pnpm run seed:demo` y luego `pnpm dev`. La web queda en `http://localhost:5173`.
2. **Tema.** El conmutador de tema cambia claro y oscuro sin recargar. Recarga la página: sigue como lo
   dejaste.
3. **Ver un material sin indexar.** Abre uno de la lista. Se ven todas sus páginas en scroll continuo,
   como un PDF. Arriba, un aviso de que no está indexado y un botón para hacerlo.
4. **Indexar.** Pulsa el botón. El progreso avanza página a página. Necesita
   `GOOGLE_GENERATIVE_AI_API_KEY` en `.env` y topa con la cuota gratis de Gemini (15 peticiones/min),
   así que un material grande tarda.
5. **Material indexado.** Aparecen dos pestañas. En "PDF", las páginas que transcribió el modelo llevan
   una marca ámbar en la esquina y las que fallaron una banda roja. En "Mapa mental", los temas salen
   en dos niveles: pulsa uno y el visor salta a su página. El botón "Colores por grupo" tiñe cada área
   y deja sus subtemas del mismo color más claro.
6. **Techos.** En el chat, escribe y mira el contador de caracteres contra el máximo. Con
   `pnpm --filter @proxus/server run agent:tutor "muéstrame las páginas 1-1000 de <material>"`, el
   agente recibe un rechazo que nombra el techo y las 1000 pedidas, y no se renderiza ninguna página.
7. **Página fuera de rango y material inexistente.** `GET /api/materials/<id>/pages/99999` responde 400
   nombrando el rango; un id que no existe responde 404. Nunca 500.
8. `pnpm test` cubre las funciones puras: umbral de densidad (599 frente a 601), escala de renderizado,
   presupuesto de turno y limitador de frecuencia con reloj inyectado.

---

## 4. Checks ejecutados

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

_Salida literal al cerrar la entrega._

Estos checks corren solos en cada PR (`.github/workflows/ci.yml`): typecheck de los cuatro
paquetes, build de la web y `pnpm test`. No hay un linter aparte a propósito. El análisis estático
de este repo es `pnpm typecheck`: `tsconfig` en modo estricto máximo más las reglas de
`@effect/language-service`, que el script `prepare` inyecta dentro del propio compilador. Un
ESLint o un Biome encima repetiría reglas que ya se comprueban, ensuciaría el diff de código de
plantilla y dejaría otra config que defender. La batería de guardarraíles queda fuera de CI:
necesita el servidor y una clave real del modelo, y CI no toca secretos.

---

## 5. Comportamiento esperado, fallos conocidos y cómo lo evalúo

<!-- `CHALLENGE.md:72` lo pide explícitamente para cualquier flujo de AI que se toque, y está fuera
     del apartado "Cómo entregar", así que es fácil saltárselo. Aquí va entero. -->

### Comportamiento esperado

**Indexación de un material (flujo de AI), fase 1.**

- **Tiene que:** usar el texto embebido cuando la página llega al umbral y no llamar al modelo en ese
  caso; renderizar y transcribir solo las páginas por debajo del umbral; guardar la procedencia de cada
  página; producir entre 3 y `maxTopicsPerMaterial` temas en un árbol de dos niveles; conservar el
  vocabulario del material tal cual; archivar el índice por `sha256` del contenido.
- **Tiene prohibido:** traducir el vocabulario del material (nunca "conjunto" si el PDF dice "set");
  inventar temas o relaciones que no estén en el texto; citar una página fuera de `[1, pageCount]` (el
  saneador de jerarquía las descarta); sustituir una página fallida por texto vacío o por el de otra
  página; devolver un índice vacío como si el material estuviera indexado; renderizar más de
  `maxPagesPerTurn` páginas o pasar de `maxTurnImageBytes` en un turno.

**Tutor (chat), lo que la fase 1 ya impone.** Todos los techos que manda el cliente (`maxSteps`,
tamaño y número de mensajes, caracteres) se acotan en el servidor desde `limits.ts`. La llamada al
modelo corre a temperatura baja y fija (`LIMITS.modelTemperature`) con techo de tokens de salida
(`LIMITS.maxModelOutputTokens`) y timeout (`LIMITS.modelCallTimeoutMs`). El agente solo ejecuta
comandos del CLI: no hay comando destructivo ni que edite los apuntes del alumno.

### Fallos conocidos

- **Un `tool-result` fabricado por el cliente se acepta** y llega al prompt como salida de herramienta
  fiable (check D3 de la batería). Es deliberado en la fase 1: el arreglo es mover la sesión al
  servidor, que se hace en la fase 4 (decisión 9 del plan, ADR-008 barrera 3). El script lo marca como
  hueco conocido y no bloquea por él. Radio de daño acotado: sin autenticación ni comando destructivo,
  el peor caso es una respuesta rara que el usuario ve.
- **La inyección de prompt no queda resuelta.** El material y el texto pegado se tratan como dato, pero
  el envoltorio con delimitador es de la fase 4. De la batería, el tutor **revela los nombres de sus
  herramientas** (`cli`, las skills) ante pregunta directa (check B4); es hardening de comportamiento
  de la fase 4, no una barrera de código.
- **La cuota gratis de Gemini (15 peticiones/min)** convierte el barrido de un material de muchas
  diapositivas en varios minutos con reintentos. Es un límite del proveedor, no del código.
- **El esquema del índice no lleva número de versión.** Cuando el esquema cambia (el `parentId` de los
  temas, en esta fase), los índices archivados quedan inservibles y hay que borrarlos y reindexar a
  mano; además un índice con esquema viejo hace fallar el listado entero. Pendiente para una fase
  posterior.
- **La jerarquía de temas depende del criterio del modelo.** El saneador garantiza que el árbol es
  válido (sin ciclos, sin referencias colgantes, dos niveles como mucho), no que el reparto de subtemas
  sea el que haría un profesor.

### Cómo lo evalúo

- **Determinista, en tests (`pnpm test`):** el umbral de densidad (`classifyPage` con 599 y 601), la
  escala de renderizado, el saneador de jerarquía (`normalizeTopicHierarchy` con cada forma rota), el
  presupuesto de turno y el limitador de frecuencia con reloj inyectado.
- **A mano, contra el corpus real:** se indexa un material de cada tipo (diapositivas y A4) y se
  comprueba la procedencia página a página y que ningún `label` de tema esté traducido.
- **Coste y latencia:** `pnpm index:materials` imprime cuánto tardó y cuántas páginas fueron al modelo.
  El camino de extracción no cuesta ninguna llamada, y ese es el ahorro que se mide.
- **Seguridad del tutor:** `pnpm dev` en una terminal y `pnpm test:guardarrailes` en otra. Comprueba
  propiedades negativas de la respuesta (no aparece ningún marcador del prompt, no cita una página
  inexistente), nunca una frase de rechazo concreta. Las D bloquean; las B avisan (con `STRICT=1`
  también bloquean); D3 es un hueco conocido que no bloquea hasta la fase 4.

---

## 6. Qué haría después con más tiempo

<!-- No es una lista de deseos: es un triaje con razones. Cada línea dice por qué NO está construida,
     y la razón tiene que ser una decisión, no "no me dio tiempo". -->

_Pendiente: el banco de ideas triado._

---

## 7. Cómo trabajé

<!-- El párrafo que enmarca `.claude/` y `notes/plans/`. Sin él, esos ficheros son desorden.
     Con él, son la respuesta al único requisito que el código de producto no puede demostrar. -->

_Pendiente._

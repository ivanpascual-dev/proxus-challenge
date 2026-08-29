# Hoja de ruta

Qué se construye y en qué orden. El plan detallado de cada fase lo escribe la skill `fase` en
`notes/plans/faseN-<nombre>.md` cuando le toca.

Los criterios de evaluación del reto se citan por número: **1** producto, **2** calidad fullstack,
**3** uso de AI, **4** arquitectura, **5** código, **6** comunicación.

## Reglas de todas las fases

- **Accesibilidad mientras se construye**: foco visible, teclado, contraste, etiquetas. La fase 5 es el
  barrido, no la primera vez que se piensa.
- **Los tests de la fase se escriben en la fase** (ADR-009). `proxus-verifier` no cierra sin ellos.
- **El límite que la fase introduce se declara en la fase**, en `packages/shared/src/limits.ts`
  (ADR-007). Capacidad nueva sin techo rompe la invariante 11.
- **`NOTES.md` se actualiza al cerrar cada fase.** El documento de entrega no es trabajo del último día.
- **Los criterios EARS van a `docs/especificacion.md`**; el plan de la fase guarda cómo se prueban.

---

## Fase 1 · El suelo

**Criterios: 3, 4, 2.**

**Problema.** Sin índice por página, ningún bloque puede decir de qué página salió y el modelo relee el
PDF entero cada vez. Sin techos, `materials view apuntes 1-1000` renderiza mil páginas y las manda
todas, y `maxSteps` lo elige el cliente. Sin tokens de tema, cada pieza de interfaz que se construya
después nace con clases oscuras literales y hay que reescribirla al añadir el modo claro.

**Qué se construye.**

- **Índice por página** (ADR-001): se extrae el texto, y si no llega al umbral de densidad se renderiza
  la página y la lee el modelo. El índice guarda por página qué camino se usó. El umbral se calibra
  contra el fixture versionado y queda escrito.
- **Endpoint de página.** Hoy `api/materials.ts` solo tiene `list` y `get`. Sin él la cita no se puede
  abrir y la invariante 8 no se puede cumplir.
- **`packages/shared/src/limits.ts`** con las cuatro familias del ADR-007, y el contador con estado en
  `packages/server/src/domain/limits/`. El tope real de petición de la API con `inlineData` ya está
  medido (20 MB) y el techo de bytes por turno queda en **12 MB contando base64**, no en los 8 MB que
  eran un supuesto.
- **Presupuesto por turno** de páginas y bytes, con aviso explícito al agotarse.
- **Las tres barreras deterministas** (ADR-008), que son límites y por eso están aquí y no en la fase 4:
  `maxSteps` acotado en el servidor (`tutor-chat-service.ts:33` hoy hace `input.maxSteps ?? 8`, que es
  un valor por defecto y no un techo), tope de longitud del array `messages`, y tope de caracteres del
  mensaje.
- **Tokens de tema claro y oscuro** con la paleta de Proxus, respetando la preferencia del sistema.
  Sustituyen a las **138 ocurrencias** de clase de color literal (ArtifactWorkspace 66, Sidebar 38,
  Chat 34, App 2), que son 51 clases distintas. La cifra de 77 que estaba aquí era incorrecta.
- **Andamio de tests**: `node:test`, script `pnpm test`, y los primeros casos (fronteras de
  `parsePageSelection`, cada límite justo por encima y justo por debajo, presupuesto agotado).

**Al terminar.** Abres un material y ves la página renderizada. Cambias el tema y la aplicación
responde. Pides mil páginas o diez mil pasos y el sistema los rechaza diciendo por qué.

**Fuera.** Subida de ficheros (fase 4). Reindexado incremental. Búsqueda dentro del índice.

---

## Fase 2 · Apuntes: el documento vivo

**Criterios: 1, 2.**

**Problema.** La nota es un texto que se lee y se cierra. No se puede corregir un párrafo que salió mal,
ni añadir lo que dijo el profesor y no está en el PDF, ni marcar lo que va a caer. Y como el texto no
sabe de qué página salió, pedir "explícame esto mejor" obliga a releer el material entero.

**Qué se construye.**

- **La nota pasa a ser una lista de bloques**, cada uno con identidad, autoría (modelo o alumno),
  procedencia (material y páginas) y **fragmento cacheado** del origen.
- **Editar, añadir bloques propios, reordenar y borrar.** Exige el endpoint de actualización que hoy no
  existe: `api/artifacts.ts` solo tiene `list`, `get` y `submit`.
- **Marcar lo importante.** Entra en el perfil como señal separada (`enfasis`, ADR-003), nunca sumada a
  la dificultad observada, para que el motivo viaje con la pregunta: "entra porque la marcaste" frente a
  "entra porque la fallaste dos veces".
- **Reescribir un bloque** más claro o más profundo **usando solo su fragmento cacheado**. Ese es el
  ahorro que justifica la caché.
- **URL externa como fuente de un bloque**, con el techo de fetch del ADR-007 (https, 5 s, 2 MB, sin IP
  privada). El límite entra con la funcionalidad, no después.
- **La etiqueta pasa a ser "Apuntes"** en la interfaz. El tipo del contrato sigue siendo `note`: en
  español "nota" colisiona con la puntuación del test, que está en la misma pantalla.
- **Si el agente recibe un comando para editar bloques**, está editando los apuntes del alumno: eso es
  acción sensible y la confirmación va en el código, no en el prompt (ADR-008, capa 2).

**Al terminar.** Los apuntes dejan de ser texto muerto: cada bloque sabe de dónde salió y se puede abrir
la página que lo respalda.

**Fuera.** Colaboración. Historial de versiones del bloque. Exportar a PDF.

---

## Fase 3 · El test que enseña

**Criterios: 1, 3.**

**Problema.** El test corrige, da una nota y ahí se acaba. No distingue entre practicar y examinarse,
que son dos actividades distintas, y lo que fallas no cambia lo que se te pregunta después.

**Qué se construye.**

- **Dos modos.** Práctica: corrige al momento, explica, no penaliza. Examen: cronómetro, sin
  correcciones hasta el final, penalización por fallo. **La penalización cambia la nota mostrada y solo
  eso**: nunca toca el perfil (invariante 5). Eso es un test automático, no una promesa.
- **Toda pregunta anclada** a material, páginas y tema del índice. La cita que no ancla se marca y se
  ve: ni se descarta ni se publica en silencio (invariante 2).
- **El bucle se cierra.** La corrección mueve el perfil de forma determinista (ADR-002), y lo que
  marcaste en los apuntes pesa en lo que se te pregunta.
- **Techo de 50 preguntas por artefacto.** Sin él, un test de 300 cuesta una fortuna generarlo y
  arrastra la interfaz al pintarlo.
- **Quiz** hereda ancla y modos casi gratis si el modelo de pregunta es común. Si no da tiempo, queda
  fuera **y se dice por qué**.

**Al terminar.** Haces un test en modo examen, ves la penalización en la nota, y el siguiente test
insiste en lo que fallaste y en lo que marcaste.

**Fuera.** Preguntas abiertas con juez fino. Repaso espaciado con calendario. Estadísticas históricas.

---

## Fase 4 · El agente

**Criterios: 3, 2.**

**Problema.** El chat no sabe de qué hablas: `App.tsx` guarda `selectedArtifactId` y no se lo pasa a
`<Chat />`, y el contrato (`api/tutor.ts`) no tiene dónde ponerlo. El system prompt son tres líneas
(`academic-tutor.ts:20-23`) sin bloque anti-manipulación ni regla de no-invención. Y el historial entero
viene del cliente, que puede fabricar mensajes de `assistant` y resultados de herramienta.

**Qué se construye.**

- **`@` para elegir qué entra**: material, artefacto, bloque, nota propia, URL.
- **Chips visibles y quitables**, cada uno enseñando lo que consume ("apuntes, p. 12-14, 3.200 de
  12.000"). Nada viaja al agente sin verse antes (invariante 9, ADR-006).
- **Lo seleccionado en pantalla se manda al chat**, pero lo mandas tú.
- **Sesión en el servidor.** El `SessionRepository` ya existe (`.data/agent-sessions`) y solo lo usa el
  camino del CLI. Pasarlo al camino HTTP cierra el agujero del historial fabricable **y es la
  funcionalidad de historial de conversaciones**: un cambio, dos cosas.
- **Observabilidad de la conversación, no solo el texto.** Hoy `StoredAgentSession` guarda `id`,
  `messages`, `createdAt` y `updatedAt` y nada más: ni tokens, ni número de llamadas a `cli`, ni los
  fallos del modelo (que `session.ts` disfraza de mensaje de texto y pierde al recargar). Al pasar la
  sesión al HTTP se amplía el modelo para registrar, por paso: el `usage` que devuelve
  `LanguageModel.generateText`, las tool calls y sus resultados (ya se emiten como mensajes), y los
  errores del turno tal cual, sin convertirlos en texto. Es la invariante 3 llevada al historial: un
  fallo del agente se guarda y se ve, no se disuelve. El coste a la vista (chips) sale de aquí.
- **System prompt canónico**: identidad y alcance, regla de datos reales con tabla de comandos,
  herramienta primero, anti-manipulación, no inventar citas.
- **El material envuelto como datos**, con delimitador, declarado como material del alumno y nunca como
  orden.
- **Subir ficheros**: PDF, `.md` y `.txt`, con techo de 25 MB y tipo comprobado por contenido, no por
  extensión.
- **`scripts/test-guardarrailes.mjs`**, la batería completa (ADR-008).
- Todo **sobre el comando `cli` que ya existe** (ADR-004): cero herramientas nuevas.

**Al terminar.** El chat sabe de qué hablas porque se lo has dicho tú, el coste está a la vista mientras
decides, y hay un comando que demuestra que los guardarraíles aguantan.

**Fuera.** Búsqueda semántica sobre todo el corpus. Compartir conversaciones. Skills invocables con `/`.

---

## Fase 5 · Pulido y prueba

**Criterios: 2, 6, 3.**

**Problema.** Lo que separa una demo de un producto son los estados que nadie enseña: el vacío, el
error, el que carga, el que no cabe. Y `CHALLENGE.md:72` pide algo que no es código: comportamiento
esperado, fallos conocidos y cómo se evaluarían.

**Qué se construye.**

- **Barrido de accesibilidad**: foco, teclado, contraste en los dos temas, lectores de pantalla.
- **Estados vacíos, de carga y de error** en cada pantalla, incluidos los mensajes de límite superado,
  que son la cara visible de la invariante 11.
- **Tres preguntas de seguimiento** que propone el tutor al terminar una respuesta.
- **`NOTES.md` final**: problema elegido, decisiones, cómo probarlo a mano, limitaciones conocidas. Ahí
  van el fusible que no es cerradura (ADR-007) y la inyección que se contiene pero no se resuelve
  (ADR-008), con el número de ataques que pasa y que no.
- **Pomodoro** si sobra tiempo.

**Al terminar.** La aplicación se comporta cuando algo va mal, y la entrega cuenta lo que no funciona
antes de que lo encuentre quien la evalúa.

---

## Línea de flotación

Si falta tiempo se cae en este orden, y **se anota que se cayó** en vez de dejarlo a medias:

1. Pomodoro.
2. Quiz (fase 3): el test cubre el mismo argumento.
3. Subida de ficheros (fase 4): el `@` sobre lo ya indexado demuestra la idea igual.
4. URL externa como fuente (fase 2): quitarla quita también el vector SSRF.
5. Sesión en el servidor (fase 4): se documenta el historial fabricable en vez de arreglarlo. Sin
   autenticación y sin datos de otros alumnos, falsificar tu propio historial solo te perjudica a ti.
   **Pasa a ser crítico el día que haya login.**

**No se cae nunca**, porque son requisito y no funcionalidad:

- Las tres barreras deterministas de la fase 1. Son una línea cada una y cierran el agujero más caro.
- La evaluación documentada con su batería (`CHALLENGE.md:72`, criterio 3).
- `NOTES.md` con las limitaciones conocidas (criterio 6).
- Los tests de lo que sí se construyó (ADR-009).

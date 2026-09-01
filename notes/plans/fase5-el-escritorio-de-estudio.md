# Fase 5 · El escritorio de estudio

> Estado de este documento: reconciliado el 2026-09-01 contra el cierre de fase 4 y reorganizado por
> prioridad de entrega. La fase 5 puede detenerse al agotar el calendario, pero solo después de dejar
> verde el corte de prioridad alcanzado. P0 es la entrega no negociable; P1, P2 y P3 añaden valor en ese
> orden y nunca retrasan la calidad visual, la estabilidad o la protección de datos internos.

## 1. Contexto

### 1.1 Por qué existe esta fase

Las fases 1 a 4 convierten la plantilla en un producto educativo con procedencia por página, apuntes
editables, pruebas que alimentan un perfil de estudio y un agente con contexto explícito. La interfaz
actual permite probar esas capacidades, pero sigue presentándolas como tres columnas rígidas y una
colección de tarjetas. El primer contacto no explica el bucle del producto y las relaciones entre PDF,
tema, apunte, corrección, perfil y chat se resuelven de forma distinta en cada pantalla.

Esta fase no es una capa cosmética. Su problema es que el valor ya construido no se percibe como un
solo flujo de estudio. El cambio tiene que hacer visible esta secuencia sin añadir otra familia de
funcionalidades:

```text
material -> comprender -> anotar -> practicar -> corregir -> repasar -> volver a la fuente
```

Ataca los criterios 1, 2, 5 y 6 del reto: criterio de producto, calidad fullstack, calidad de código y
comunicación. También hace observable la actividad del agente construida en la fase 4, por lo que
refuerza el criterio 3 sin modificar sus decisiones de seguridad.

### 1.2 El dato que gobierna el diseño

La aplicación tiene dos objetos de trabajo simultáneos y uno de navegación:

- El material es el documento de referencia.
- Sym es el tutor académico y el espacio de conversación y acción dentro de Symma.
- El sidebar solo elige materiales y aloja controles globales mínimos.

El sidebar no es un tercer documento y no necesita crecer. La relación espacial correcta es por eso:

```text
sidebar fijo | material variable | Sym variable
```

La medición actual confirma el problema: `App.tsx:89-119` fija `340px minmax(0, 1fr) 420px` cuando
hay material, y `340px minmax(0, 1fr)` cuando no lo hay. El sidebar consume 340 px aunque solo lista
materiales, el chat queda encerrado a 420 px y no existe separador ni modo de cerrar el material.

El segundo dato es el perfil disponible. `StudyProfile` no es un perfil de cuenta. Es una lectura por
material y tema con seis señales explícitas: aciertos, fallos, sin evaluar, en blanco, pistas y énfasis.
No contiene identidad, preferencias personales ni una medida agregada de dominio. La interfaz debe
mostrar esas señales sin inventar un porcentaje ni mezclarlas.

### 1.3 Puerta de entrada real desde el cierre de fase 4

La comparación con el código deja esta frontera, que sustituye las suposiciones del primer borrador:

| Capacidad | Estado real tras 4G y la pasada final | Consecuencia para fase 5 |
| --- | --- | --- |
| Sesión e historial | Listar, crear, leer y borrar conversaciones ya vive en servidor. Los mensajes y turnos se restauran, pero el mensaje de usuario persistido incluye el bloque técnico de contexto añadido para el modelo. | El cliente no vuelve a ser autoridad. El contrato de turno separa texto visible y contexto antes del rediseño. |
| Actividad | Los mensajes conservan llamada y resultado en orden. Cada turno guarda pasos, uso, llamadas y error, pero no `callId`, duración ni resultado dentro de `ConversationStep`. | Se agrupa por turno y orden estable. No se inventan ids ni duración. |
| Contexto | Existen referencias `material`, `artifact` y `block`, visibles y retirables. El bloque todavía no tiene origen visual y no existe referencia de página. | Fase 5 activa `block` al seleccionar un bloque y añade el contrato mínimo de página. |
| Citas | Apuntes, preguntas y correcciones tienen procedencia estructurada. El chat no emite citas estructuradas. | La cita común cubre los datos ya verificados. La procedencia del chat requiere una fuente estructurada nueva y nunca se extrae del Markdown con regex. |
| Subida | Solo PDF. Al elegir un lote, `POST /validate` comprueba tipo real y nombre duplicado sin escribir; cada fichero puede retirarse y el botón de subida solo se habilita cuando todos son válidos. Después, upload, indexado y apuntes siguen encadenados desde cliente. | El rediseño conserva prevalidación, retirada, bloqueo explícito y progreso; no vuelve a subir al soltar ni duplica la validación en cliente. |
| Conversaciones | Existe crear, listar y borrar. Al iniciar `Chat` se crea una conversación vacía. | La papelera llama al servidor y el historial se mueve fuera del sidebar global. |
| Preguntas de seguimiento | Hay evento y componente. Fase 4 ya retira siempre el sufijo técnico y recupera tres preguntas válidas cuando solo falta el cierre; un cuerpo no validable produce cero botones. | Fase 5 conserva ese contrato y rediseña su presentación. No vuelve a parsear delimitadores en React ni inventa preguntas. |
| Consumo | Se mide y persiste, pero `TurnCost` se retiró por decisión de producto. | Los tokens no aparecen en ninguna superficie para el estudiante. |

Los tramos 4F y 4G están cerrados en alcance y decisiones. El punto de control 0 fija su commit de
partida y confirma las regresiones que sí afectan a la entrega; el borde de selecciones sucesivas del
uploader se registra como revisión P3 porque `upload` sigue rechazando el lote y no hay pérdida de
datos. Las dos capacidades que fase 4 nunca prometió, página contextual y procedencia estructurada del
chat, siguen definidas en la sección 5, pero se ejecutan al final si el calendario llega hasta ellas.

## 2. Decisiones cerradas, no volver a preguntar

1. **Todo el rediseño visual vive en la fase 5.** La fase 4 entrega capacidad funcional y contratos;
   la fase 5 compone la experiencia cuando esos contratos ya son estables.
2. **La tipografía sigue siendo Montserrat.** Ya es el token `--font-sans`; cambiarla no aporta al
   problema y rompería continuidad con el tema claro aprobado.
3. **El tema claro conserva su paleta.** Solo se ajustan estilos de componente y contraste cuando una
   combinación real falle.
4. **El tema oscuro pasa de azul tinta a carbón violeta.** Tiene que sentirse como el mismo producto
   que el claro, no como otra marca.
5. **El sidebar mide 224 px en escritorio y nunca es redimensionable.** Solo contiene identidad mínima,
   subida, materiales, avisos de estado del material y el selector de tema al pie.
6. **Apuntes, Controles y Exámenes no vuelven al sidebar.** Viven dentro de su material. Los ficheros
   ilegibles se comunican mediante un aviso global, no ampliando la navegación.
7. **Sin material abierto, Sym ocupa todo el espacio de trabajo.** Ese es el estado inicial y el que
   se recupera al cerrar el material.
8. **Con material abierto, solo el límite Material/Sym se arrastra.** El material empieza al 58 por
   ciento y Sym al 42 por ciento del espacio restante. Cada panel conserva un mínimo de 420 px.
9. **El ancho elegido se recuerda localmente.** Se guarda solo la proporción de los paneles, nunca
   contexto, perfil ni contenido educativo.
10. **Cerrar el material es una acción explícita.** Arrastrar nunca colapsa un panel a cero. Esto evita
    cerrar una superficie por accidente y mantiene el separador accesible por teclado.
11. **No se añade un perfil de usuario.** La aplicación no tendrá avatar, nombre, cuenta ni preferencias
    de estudiante. Tendrá `Progreso de este material`, una vista de solo lectura del perfil ya existente.
12. **El progreso nunca muestra un porcentaje de dominio.** Presenta las señales separadas y el motivo
    literal de cada recomendación.
13. **La recomendación siguiente la decide código puro.** El modelo puede explicarla si el alumno la
    adjunta al chat, pero no seleccionarla ni escribir el perfil.
14. **La interfaz del material mantiene cuatro pestañas.** PDF, Mapa, Apuntes y Pruebas. El progreso se
    abre desde la cabecera, no crea una quinta pestaña permanente.
15. **PDF mantiene lectura continua.** Gana una tira izquierda de miniaturas, página activa, navegación
    directa y controles de ajuste. Las miniaturas cargan al entrar en viewport y reutilizan la misma
    consulta de página.
16. **El mapa se mueve como un lienzo.** Arrastrar desplaza, rueda o controles cambian el zoom, y no hay
    scroll interno de documento para recorrer el grafo.
17. **Pulsar un tema abre un único menú de acciones.** Sus acciones son abrir páginas, ir al bloque de
    apuntes, crear Control y preguntar a Sym.
18. **Ir del tema al apunte se resuelve con datos existentes.** Se elige el bloque del mismo material
    cuyas páginas solapen más con las del tema; empate por orden del apunte. Si no existe, se abre
    Apuntes y se dice que no hay bloque vinculado. No se inventa una relación ni se modifica el schema.
19. **Apuntes enseña un bloque principal cada vez.** La columna izquierda lista todos los bloques,
    propuestas y estado; cambiar de bloque no descarta el borrador global ni guarda en silencio.
20. **Pruebas se divide visualmente en tres grupos.** Controles, Exámenes de prueba y Exámenes reales.
    `De repaso` es un origen y se presenta como etiqueta dentro de cada grupo, no como un cuarto tipo.
21. **La marca del producto es Symma y el nombre visible del agente es Sym.** Su descripción corta es
    `Tutor académico`. Se retiran `Proxus Tutor`, `Asistente académico`, `Nexo`, `Compañero de estudio`
    y `Sesión efímera` de la interfaz. Symma nombra el escritorio completo; Sym nombra solo al tutor.
22. **La respuesta de Sym no vive en una tarjeta.** El texto del asistente se presenta sobre el lienzo;
    el mensaje del alumno conserva una superficie tenue y compacta.
23. **Las herramientas se agrupan por turno.** La vista normal dice `Consultando el material`,
    `Preparando una respuesta` o `No se pudo completar una acción`; el detalle técnico es desplegable.
24. **El composer no se redimensiona manualmente.** Crece automáticamente hasta seis líneas, Enter
    envía, Shift+Enter inserta salto, y una composición IME nunca se envía a mitad.
25. **Vaciar el chat se representa con una papelera y confirmación.** Su semántica viene de fase 4;
    el frontend no finge borrar eliminando solo su array local.
26. **Una sola procedencia visual sirve a chat, apuntes y pruebas.** En datos educativos representa la
    cita verificada; en chat se etiqueta `Fuentes consultadas`. Siempre abre el material correcto,
    cambia a PDF y navega a la primera página. Una procedencia sin ancla conserva su motivo visible.
27. **No se añade una librería de layout, iconos, split panes o pan/zoom.** React 19, Pointer Events,
    SVG, Tailwind 4 y las dependencias actuales bastan. Los iconos son SVG locales con una API común.
28. **La interfaz principal es desktop-first, pero no se rompe por debajo.** A partir de 1180 px hay
    split; entre 768 y 1179 px se enseña Material o Sym de uno en uno; por debajo de 768 px el sidebar
    es un drawer y sigue habiendo una sola superficie de trabajo.
29. **El Examen real conserva su puerta cerrada.** No hereda sidebar, cabecera, chat, citas ni controles
    del nuevo AppShell mientras esté en curso.
30. **La fase no termina con capturas bonitas.** Termina con estados vacíos, carga, error, límites,
    teclado, contraste, movimiento reducido, prueba manual y documentación de entrega.
31. **El historial de conversaciones pertenece a Sym, no al sidebar global.** Un icono en
    `ChatHeader` abre un panel temporal con búsqueda simple, nueva conversación, selección y borrado.
    El sidebar de 224 px sigue dedicado únicamente a materiales y controles globales.
32. **Las preguntas de seguimiento se conservan.** Aparecen como acciones de texto compactas después
    de la última respuesta, solo cuando el servidor entrega tres válidas. No se inventan en cliente ni
    ocupan el estado vacío para decorar.
33. **Todo mensaje normal de interfaz habla para el estudiante.** Errores, avisos, límites, progreso y
    confirmaciones dicen qué ocurrió, qué parte queda afectada y qué puede hacer a continuación. Nunca
    muestran `_tag`, `SchemaError`, estado HTTP, stack, ruta local, JSON, id interno, nombre de proveedor
    o texto crudo de una excepción. La causa técnica se conserva en consola o logs. La única excepción
    es el segundo nivel desplegado de la actividad del agente, solicitado expresamente para inspección.
34. **La identidad conversacional tiene una sola fuente.** El system prompt canónico dice que el agente
    es Sym, el tutor académico dentro de Symma. No se repite en cada llamada, skill o mensaje de usuario:
    todas las llamadas del harness ya reciben el mismo system prompt y duplicarlo gastaría contexto y
    permitiría contradicciones.
35. **Sym conoce el producto, pero no adivina la pantalla.** Siempre sabe que conversa dentro de Symma,
    conoce las cuatro pestañas visibles y sus capacidades, pero solo afirma qué material, pestaña,
    página, artefacto o bloque está viendo el estudiante cuando llega mediante `ChatContextRef`.
36. **Los servicios de generación no interpretan a Sym.** Indexación, apuntes, preguntas, reescritura,
    fuentes URL y juez conservan prompts impersonales. Se auditan para eliminar referencias antiguas,
    pero no reciben nombre, personalidad ni ubicación porque producen datos, no conversación.
37. **La pestaña y la prueba abierta son datos distintos.** `MaterialSurface` permite afirmar que el
    estudiante está en `Pruebas`; una `AssessmentContextRef` separada identifica el Control o Examen
    de prueba concreto y si está resolviéndolo o viendo su historial. En la lista no se adjunta ninguna
    prueba. El servidor deriva y valida tipo, modo y material desde el `artifactId`: el navegador no los
    repite ni Sym los deduce del título.
38. **El contexto técnico nunca es una burbuja de chat.** El bloque `SCREEN CONTEXT` puede seguir en el
    historial interno que consume el modelo, pero la respuesta del API y el render visible usan
    `ConversationTurn.input` y chips humanos. El estudiante ve y puede retirar `Material`, `Apuntes`,
    `Página` o `Prueba`; nunca ve delimitadores, ids ni la frase inglesa enviada al modelo.
39. **La prevalidación de PDFs se conserva como una sola cola.** `Subir material` abre una superficie de
    subida con los estados `Comprobando`, `Listo para subir`, `Rechazado`, subida, indexado y apuntes.
    Cerrar y volver a abrir esa superficie no pierde la cola ni interrumpe un trabajo ya iniciado.
40. **La fase se ejecuta por prioridad, no por subsistema.** P0 deja una entrega visualmente coherente,
    estable y segura; P1 mejora las superficies de estudio más visibles; P2 añade refinamiento; P3
    concentra backend, contratos opcionales y el responsive completo. No se empieza un nivel sin
    cerrar el anterior.
41. **Backend va al final salvo impacto directo en la entrega.** Solo se adelantan la identidad
    Sym/Symma, la separación entre mensaje visible y contexto interno, la persistencia segura de
    follow-ups y cualquier arreglo necesario para evitar crash, pérdida de datos o exposición de
    información interna. `MaterialSurface`, página, prueba estructurada y fuentes del chat son P3.
42. **Cada corte es entregable.** Si termina el tiempo después de P0, la aplicación debe poder
    presentarse sin disculpas: todas las rutas actuales conservan función, comparten lenguaje visual,
    explican sus fallos y no muestran JSON, ids, stack, prompts, base64 ni mensajes técnicos. Lo que no
    quepa queda documentado como no implementado, nunca a medias ni simulado.

## 3. Estado de partida verificado

Verificado el 2026-09-01 sobre el árbol de trabajo actual y la pasada final de cierre de fase 4.
`notes/plans/fase4-el-agente.md` se usa como fuente y este plan no lo reescribe. La certificación se
ha hecho contra el código, la bitácora y los contratos actuales.

### 3.1 Aplicación y layout

- `packages/web/src/App.tsx` posee localmente material seleccionado, examen abierto y contexto de
  pantalla; este último se propone a `Chat` y queda vacío cuando no hay material.
- La puerta de Examen real y `ResumeExamDialog` ya sustituyen la aplicación completa y se conservan.
- El shell sigue siendo un grid rígido de `340px minmax(0, 1fr) 420px`, o dos columnas sin material.
- Sidebar, MaterialPanel y Chat ya tienen un `ErrorBoundary` independiente.

### 3.2 Sidebar y tema

- `packages/web/src/components/Sidebar.tsx` ya lista solo materiales, permite subir PDFs y borrar un
  material con sus artefactos en cascada. No lista apuntes ni pruebas.
- El sidebar completo hace scroll y conserva reglas responsive antiguas basadas en `max-md`.
- Todavía presenta `Proxus Tutor` y `Asistente académico`, usa un `details` contenedor y una tarjeta
  redondeada por material.
- Los avisos de artefactos ilegibles enseñan hoy nombre de fichero y razón cruda dentro del sidebar;
  la nueva estructura los mueve a `SystemNoticeRegion` y aplica la política de mensajes humanos.
- `UploadDropzone.tsx` ya tiene una etapa previa persistida en estado local: llama automáticamente a
  `POST /api/materials/validate`, muestra cada fichero como `validating`, `valid` o `rejected`, permite
  retirarlo y no habilita la subida mientras quede alguno comprobándose o rechazado. La ruta no escribe,
  no consume `uploadsPerWindow` y no comprueba el límite agregado `maxMaterials`.
- La implementación de cierre valida únicamente el `FileList` recién añadido. Un nombre
  repetido o más de `maxFilesPerUpload` repartidos entre dos selecciones pueden aparecer válidos hasta
  que `upload` los rechaza. Como servidor y escritura siguen protegidos, se acepta en fase 4 y se
  reevalúa en P3: no consume tiempo mientras falte cualquier tarea visual, de estabilidad o privacidad.
- Tras confirmar, el cliente conserva el encadenado upload -> indexado -> generación de apuntes. Fase 5
  cambia su contenedor visual y eleva la cola para que cerrar el diálogo no desmonte el proceso; no
  cambia el contrato ni vuelve a una subida automática al soltar.
- `packages/web/src/components/ThemeToggle.tsx:4-25` es un select de tres opciones y la preferencia ya
  se conserva.
- `packages/web/src/theme.ts:1-54` resuelve sistema, claro y oscuro y escucha cambios del SO.
- `packages/web/src/styles.input.css:11-46` contiene la paleta clara que no se cambia.
- `packages/web/src/styles.input.css:51-68` contiene el oscuro azul actual que esta fase sustituye.

### 3.3 Chat

- `packages/web/src/components/Chat.tsx` crea una conversación vacía al montar, lista conversaciones
  mediante `ConversationList` y pide al servidor el historial elegido. El cliente solo manda
  `conversationId`, entrada nueva, contexto y el techo declarado de pasos.
- `ConversationList` ocupa actualmente otros 220 px permanentes dentro de Chat. Choca con la decisión
  de reservar el sidebar global a materiales y se convierte en panel temporal desde `ChatHeader`.
- Los mensajes se hidratan desde servidor y se añaden durante streaming. La autoridad persistente ya
  no está en un array enviado por el navegador.
- `tutor-chat-service.ts` concatena el bloque canónico `SCREEN CONTEXT` a la entrada antes de llamar al
  harness, y ese texto combinado se persiste como mensaje `user`. El historial actual puede enseñar
  delimitadores e ids internos al recargar; fase 5 guarda entrada visible y contexto por separado.
- Las invalidaciones siguen emparejando llamadas y resultados por una cola ordenada. Los contratos no
  tienen `callId`; el rediseño conserva el orden real y no inventa identidad.
- La actividad pinta cada `tool-call` y `tool-result` como un `details` separado con JSON. El textarea
  usa tres filas, `resize-y` y no implementa todavía Enter, Shift+Enter, IME ni autosize.
- El hallazgo final de fase 4 confirma que `Chat.tsx` vuelca `tool-result.result` completo en un `<pre>`;
  una página leída como imagen puede introducir megas de base64. `AgentActivity` de fase 5 sustituye
  ese render por resumen humano y detalle filtrado y abreviado; no corta el dato persistido.
- `ChatContextBar` ya hace visible y retirable el contexto. `FollowUpQuestions` ya muestra las tres
  preguntas del evento. Streamdown ya renderiza Markdown y se reutiliza.
- `ConversationStep` persiste uso, llamadas y error por paso. El uso se descarta en la interfaz por
  decisión explícita y no vuelve en fase 5. Los resultados técnicos siguen disponibles en los
  mensajes persistidos, no dentro de `ConversationStep`.
- `packages/web/src/lib/error-message.ts` devuelve cualquier string o propiedad `message` no vacía.
  Aunque los comentarios prometen ocultar detalle interno, hoy puede enseñar literalmente el mensaje
  de una excepción desconocida. `stream-error.ts` confía igualmente en cualquier `message` JSON.

### 3.4 Material y PDF

- `packages/web/src/components/MaterialPanel.tsx:29-84` coordina pestaña, salto a PDF y Control pendiente.
- `packages/web/src/components/MaterialPanel.tsx:39` define las cuatro pestañas correctas.
- `packages/web/src/components/MaterialPanel.tsx:52-84` contiene cabecera, tabs y las cuatro superficies
  en un mismo componente.
- `packages/web/src/components/MaterialPanel.tsx` tiene 630 líneas y además contiene PDF, mapa,
  indexación y adaptación del apunte. Se divide sin cambiar comportamiento de una vez.
- `packages/web/src/components/MaterialPanel.tsx:112-184` renderiza las páginas continuas con carga
  diferida mediante IntersectionObserver. Es la base del visor nuevo.
- `packages/web/src/components/MaterialPanel.tsx:186-238` obtiene cada imagen por el endpoint existente;
  no existe endpoint de thumbnail y no hace falta añadirlo si la tira es diferida.

### 3.5 Mapa mental

- `packages/web/src/domain/materials/mindmap-layout.ts:1-195` ya contiene un layout puro y testeado para
  árbol de dos niveles. No se sustituye.
- `packages/web/src/components/MaterialPanel.tsx:260-421` pinta el layout en SVG de tamaño fijo dentro
  de un contenedor con `overflow-auto`.
- El mapa actual abre la primera página desde el rectángulo y genera Control desde un símbolo `+`; no
  existe selección, popover, pan ni zoom.

### 3.6 Apuntes

- `packages/web/src/components/note/NoteWorkspace.tsx:33-108` mantiene un borrador global y guarda el
  apunte entero. Este modelo permite seleccionar un bloque sin perder cambios.
- `packages/web/src/components/note/NoteWorkspace.tsx:110-223` renderiza título, propuestas y todos los
  bloques en una sola columna.
- `packages/web/src/components/note/NoteWorkspace.tsx:169-182` monta un editor TipTap por cada bloque al
  mismo tiempo. Seleccionar uno reduce trabajo de render sin cambiar persistencia.
- `packages/shared/src/schemas/note.ts:33-39` no guarda `topicId` en el bloque.
- `packages/shared/src/schemas/note.ts:6-14` sí conserva material y páginas, suficientes para resolver
  de forma determinista el bloque más próximo a un tema.
- `packages/web/src/components/note/BlockCitation.tsx:22-69` abre las páginas dentro del bloque. La nueva
  cita común navegará al PDF en vez de duplicar el visor.

### 3.7 Pruebas y perfil

- `packages/web/src/components/assessment/AssessmentsTab.tsx:20-28` ya distingue Control, Examen de
  prueba y Examen real con datos del artefacto.
- `packages/web/src/components/assessment/AssessmentsTab.tsx:75-139` mezcla los tres en una única lista.
- `packages/web/src/components/assessment/AssessmentsTab.tsx:229-327` ya lee el perfil y ofrece origen
  de repaso cuando existe alguna señal.
- `packages/web/src/domain/profile/atoms.ts:6-16` expone `studyProfileQuery` de solo lectura.
- `packages/shared/src/schemas/study-profile.ts:11-25` mantiene correct, incorrect, unevaluated, blank e
  hintsRevealed separados.
- `packages/shared/src/schemas/study-profile.ts:41-56` añade topicLabel y emphasis a la lectura HTTP.
- `packages/web/src/components/assessment/StudyProfilePanel.tsx` ya implementa la vista inicial del
  perfil dentro de Pruebas. La fase 5 la convierte en panel de lectura y conserva sus señales.

### 3.8 Dependencias reales

`packages/web/package.json` fija React 19.2.7, Vite 8.0.16, Tailwind 4.3.1, Effect y Atom React
4.0.0-beta.83, TipTap 3.30.5, Streamdown 2.5.0 y happy-dom 20.12.0. No hay router, librería de iconos,
split panes, virtualización ni pan/zoom. Esta fase no añade ninguna.

### 3.9 Divergencias documentales que se cierran en la fase

- `notes/hoja-de-ruta.md:166-183` describe la fase 5 como pulido, preguntas de seguimiento y Pomodoro;
  esta fase sustituye ese alcance por el escritorio de estudio acordado.
- `notes/hoja-de-ruta.md:194` ya permite caer Pomodoro; se elimina del alcance en vez de dejarlo como
  opcional.
- `notes/plans/fase3-el-test-que-ensena.md:895-912` manda Controles, Exámenes y dos paneles de apuntes a
  fase 5. Solo se recupera la vista de apuntes; las pruebas no vuelven al sidebar.
- `docs/especificacion.md:447-449` todavía no tiene criterios de fase 5.
- `docs/ai-agent.md:119` y `NOTES.md:254` todavía describen artefactos en el sidebar y se corrigen al
  cerrar, no durante la extracción inicial de componentes.
- `docs/especificacion.md:462` enlaza un `docs/extensibilidad.md` inexistente. Se elimina el enlace o se
  crea el documento solo si la entrega realmente necesita ese triaje.
- El plan de fase 4 todavía describe `TurnCost` como interfaz visible, pero la bitácora registra que se
  construyó y retiró por decisión de Iván. El código actual prevalece: el consumo es diagnóstico.
- Fase 4 tampoco documentaba inicialmente el borrado de material; el código, ADR-024 y la bitácora ya
  fijan borrado en cascada con confirmación previa en interfaz.

### 3.10 Cierre real de fase 4 y residuos conocidos

- 4F está cerrado. `assessment-generation.eval.ts` y `note-generation.eval.ts` se ejecutaron antes y
  después de traducir los prompts, con thinking `off`, `low` y `high`, dos veces por combinación. La
  evidencia y las limitaciones de cada medida están registradas en bitácora y NOTES.
- 4G está cerrado. El tutor y las cinco skills trabajan en inglés internamente, la eval se llama
  `tutor-behaviour.eval.ts`, y los niveles medidos quedan en `high` para apuntes, `low` para Examen y
  `off` para el juez. El arreglo de lectura con contexto terminó con dos corridas consecutivas de la
  eval de comportamiento en 6/6 y sin tool failures.
- La pasada final de fidelidad añade cuatro hechos que fase 5 toma ya como suelo: producción registra
  `finishReason: "length"`; la subida tiene `POST /api/materials/validate` y confirmación separada; el
  follow-up nunca deja delimitadores visibles y recupera tres preguntas completas si solo falta el
  cierre; y el límite por pregunta es 200, declarado también en el prompt.
- Esa misma pasada deja deliberadamente para fase 5 el `result` crudo de las herramientas que hoy
  renderiza `Chat.tsx`. No se añade un parche intermedio: §4.4 lo reemplaza por resumen humano, filtro
  de secretos y abreviado visual probado con resultados que contienen base64.
- La batería estricta confirmó las barreras D1 a D4. B4, no revelar herramientas internas cuando se
  le pide, sigue como hardening de comportamiento conocido; B9 quedó no comprobado al no proporcionar
  `FIXTURE_MATERIAL_ID`. Ninguno cambia un contrato visual y fase 5 no los declara resueltos.
- El barrido dejó tres listados existentes sin techo: `artifacts show` para pruebas, `artifacts list`
  y `artifacts attempts` sin filtro. Siguen siendo deuda explícita de la invariante 11. El abreviado
  visual de actividad de fase 5 evita inundar la interfaz, pero no se presenta como solución al
  presupuesto de contexto del agente.
- `extractFollowUp` ya retira cualquier sufijo que comienza con el marcador canónico fuera de un
  bloque de código. Si hay tres líneas válidas hasta EOF, las emite incluso cuando falta únicamente el
  cierre; si el cuerpo no se puede validar, persiste cero preguntas. Fase 5 conserva esta garantía y
  no busca marcadores con regex durante el render.
- `tutor-chat-service.ts` puede construir un fallo interno incluyendo la razón técnica, y los eventos
  de stream solo llevan `message`. La política completa para toda la aplicación se cierra en 5A
  mediante `user-feedback.ts`.

### 3.11 Identidad actual verificada el 2026-09-01

- `packages/server/src/domain/agents/academic-tutor.ts` todavía abre con `You are the academic tutor of
  Proxus`. Es la única identidad de producto que recibe hoy el tutor conversacional y se sustituye por
  Sym/Symma.
- Cada llamada del bucle pasa por `renderPrompt` y ya recibe el system prompt canónico. No hace falta
  cambiar el schema de `load_skill`, `cli` ni repetir identidad en cada paso.
- Las cinco skills describen capacidades y vocabulario de interfaz, pero no fijan marca. Solo necesitan
  un barrido de consistencia con las cuatro pestañas.
- `rewrite-block-prompts.ts` usa la frase genérica `academic tutor` aunque es un servicio de reescritura.
  Se vuelve impersonal; los demás prompts de generación no reciben la identidad de Sym.
- `MaterialPanel` sabe qué tab está activa, pero `MaterialContextRef` no la transporta. Con solo material
  y artefacto, Sym no puede distinguir de forma fiable PDF, Mapa, Apuntes y Pruebas. La sección 5.2
  incorpora `MaterialSurface` para cerrar ese hueco sin aumentar `maxContextRefs`.
- En Pruebas, `AssessmentsTab` ya comunica a `MaterialPanel` el `id` y título del artefacto abierto al
  resolverlo o consultar su historial. Ese `ArtifactContextRef` apunta al Control o Examen exacto,
  pero pierde `view.kind` y no declara su tipo o modo. La sección 5.2 lo sustituye en esta superficie
  por `AssessmentContextRef`; la lista sigue sin fingir que hay una prueba seleccionada.
- `AttemptHistory` puede abrir un intento concreto, pero hoy no eleva `openId`, y el solver presenta
  todas las preguntas en una lista. Fase 5 no afirma que Sym vea un intento o pregunta concreta: solo
  adjuntará ese nivel en una fase futura si la interfaz introduce una selección explícita y retirable.

## 4. Qué se construye, pieza a pieza

### 4.1 Puro y testeable

#### `packages/web/src/domain/workspace/layout.ts`

Contrato:

```ts
export type WorkspaceMode = "chat" | "split";

export interface WorkspaceLayout {
  readonly mode: WorkspaceMode;
  readonly materialRatio: number;
}

export interface SplitBounds {
  readonly availableWidth: number;
  readonly minMaterialWidth: number;
  readonly minChatWidth: number;
}

export const DEFAULT_MATERIAL_RATIO = 0.58;
export const clampMaterialRatio: (ratio: number, bounds: SplitBounds) => number;
export const ratioFromPointer: (clientX: number, contentLeft: number, bounds: SplitBounds) => number;
export const decodeStoredLayout: (value: string | null) => WorkspaceLayout;
```

Reglas:

- Valor ausente o roto devuelve modo chat y ratio 0.58.
- Un ratio fuera de rango se acota, no rompe el layout.
- El mínimo de cada panel es 420 px.
- El modo split solo se activa cuando existe material seleccionado y el viewport admite los dos
  mínimos más el separador.
- Persistir puede fallar sin tumbar la interfaz; el layout ya se aplica en memoria.

Tests en `packages/web/src/domain/workspace/layout.test.ts`: valor roto, ambos extremos, anchura exacta,
anchura insuficiente y roundtrip de persistencia.

#### `packages/web/src/domain/materials/mindmap-viewport.ts`

Contrato:

```ts
export interface CanvasTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export const MIN_MINDMAP_SCALE = 0.45;
export const MAX_MINDMAP_SCALE = 2.25;
export const zoomAtPoint: (...) => CanvasTransform;
export const panBy: (...) => CanvasTransform;
export const fitMindMap: (...) => CanvasTransform;
```

`zoomAtPoint` conserva bajo el cursor el mismo punto del grafo. `fitMindMap` añade 32 px de margen y
nunca sale del rango. Los tests comprueban mínimo, máximo, ancla del cursor y centrado.

#### `packages/web/src/domain/materials/note-target.ts`

Contrato:

```ts
export const findBlockForTopic: (
  blocks: readonly NoteBlock[],
  materialId: string,
  topicPages: readonly number[]
) => string | null;
```

Solo considera fuentes de material con el mismo `materialId`. Gana el mayor número de páginas en
común; empate por posición actual. Cero intersección devuelve `null`. No usa contenido del markdown,
título ni similitud textual.

Tests: material distinto, fuente URL, una coincidencia, máximo solape, empate por orden y ninguna.

#### `packages/web/src/domain/profile/next-study-action.ts`

Contrato:

```ts
export type NextStudyAction =
  | { readonly kind: "finish-setup"; readonly target: "index" | "notes" }
  | { readonly kind: "first-control"; readonly topicId: string; readonly topicLabel: string }
  | { readonly kind: "review"; readonly topicId: string; readonly topicLabel: string;
      readonly reason: "incorrect" | "hint" | "emphasis"; readonly count: number | null }
  | { readonly kind: "new-practice" }
  | { readonly kind: "no-data"; readonly reason: string };
```

Orden sin puntuación compuesta:

1. Material sin índice: terminar preparación.
2. Material sin apunte: preparar apuntes.
3. Sin intentos y con tema: primer Control del primer tema hoja por página.
4. Si existe algún fallo: tema con más `incorrect`; empate por orden del perfil.
5. Si no hay fallos y existe alguna pista: tema con más `hintsRevealed`.
6. Si no hay fallos ni pistas y existe énfasis: primer tema enfatizado.
7. Con actividad y sin señal de repaso: práctica nueva.
8. Datos incompletos: `no-data` con motivo, nunca una recomendación neutra.

La recomendación muestra solo la señal que decidió la rama. No suma señales ni guarda un score.

Tests: cada rama, empates estables y prueba explícita de que énfasis no gana cuando hay fallos.

#### `packages/web/src/domain/assessments/group-assessments.ts`

Separa `AssessmentListEntry[]` en `controls`, `practiceExams` y `realExams` sin modificar su orden. El
origen review permanece en la entrada. Test con lista mezclada y vacía.

### 4.2 Componentes que hablan con navegador y estado

#### `packages/web/src/components/shell/AppShell.tsx`

Recibe Sidebar, Material y Chat como slots. Posee solo layout visual, breakpoint y persistencia de la
proporción. No consulta APIs. Aplica:

- Escritorio: columnas `224px minmax(420px, ratio) 12px minmax(420px, resto)`.
- Escritorio sin material: `224px minmax(0, 1fr)`.
- Tablet: sidebar de 208 px y una sola superficie elegida mediante control en cabecera.
- Móvil: sidebar en drawer modal y una sola superficie.
- `prefers-reduced-motion`: sin transición de apertura ni desplazamiento animado.

El divisor visible mide 1 px, pero su botón tiene 12 px de área de interacción. Tiene
`role="separator"`, `aria-orientation="vertical"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` y
responde a flechas en pasos de 24 px, Home y End dentro de sus mínimos.

#### `packages/web/src/components/shell/SystemNoticeRegion.tsx`

Recibe los artefactos ilegibles y fallos globales que no pertenecen a un material. Los muestra sobre
el workspace como aviso compacto, descartable solo visualmente. Descartar no borra el fichero. El
mensaje usa la capa de presentación descrita abajo y nunca muestra la razón cruda del fichero.

#### `packages/web/src/lib/user-feedback.ts`

Sustituye el uso directo de `messageOf` por una frontera explícita entre comunicación y diagnóstico:

```ts
type UserNotice = {
  readonly tone: "info" | "success" | "warning" | "danger";
  readonly title: string;
  readonly description?: string;
  readonly action?: "retry" | "new-conversation" | "open-material" | "dismiss";
};

type UserOperation =
  | { readonly area: "materials"; readonly action: "list" | "upload" | "delete" | "page" | "index" }
  | { readonly area: "notes"; readonly action: "load" | "generate" | "save" | "delete" | "proposal" | "source" }
  | { readonly area: "assessments"; readonly action: "list" | "generate" | "load" | "hint" | "history" }
  | { readonly area: "attempts"; readonly action: "start" | "save" | "submit" | "resume" | "cancel" }
  | { readonly area: "profile"; readonly action: "load" }
  | { readonly area: "chat"; readonly action: "list" | "create" | "load" | "send" | "delete" };
```

`toUserNotice(cause, operation)` solo usa datos de una lista cerrada de errores de dominio que sean
seguros y útiles para el estudiante. Un error desconocido recibe copy específico de la operación, no
`cause.message`. `reportDiagnostic(cause, { operation, surface })` conserva tipo, causa, operación y
superficie con `console.error` o `console.warn` en desarrollo, después de retirar claves, tokens y
cuerpos binarios; el servidor mantiene su log técnico. Ningún componente decide por su cuenta qué
parte de una excepción enseñar.

`packages/web/src/lib/stream-error.ts` deja de convertir cualquier `message` JSON en copy visible. Los
eventos `progress`, `failed`, `warning` y `error` se registran técnicamente y se traducen según la
operación. El cliente compone estados como `Preparando la página 3 de 10` a partir de campos
estructurados; no confía en una frase arbitraria del servidor.

Cada aviso visible responde, cuando aplica, a estas tres preguntas: qué ha ocurrido, qué se conserva o
queda afectado, y qué puede hacer el estudiante. No se añade una notificación flotante global para
todo: el error queda junto a la acción que falló; `SystemNoticeRegion` se reserva para problemas sin
superficie propietaria.

#### `packages/web/src/App.tsx`

Conserva la puerta del examen y los ErrorBoundary. Sustituye el grid inline por `AppShell`. Añade:

- `onCloseMaterial`, que vuelve a chat sin material.
- Navegación común `{ materialId, tab, page?, blockId?, assessmentGroup? }` en estado del App. No se
  añade router ni se escribe URL en esta fase.
- Acción `openCitation` para material, página y pestaña.
- Acción `attachContext` que delega al contrato de fase 4 y no manda nada hasta que el alumno envía.

El material seleccionado sigue siendo estado efímero. Recargar abre chat; la sesión de chat sí la
restaura fase 4 desde servidor.

#### `packages/web/src/components/Sidebar.tsx`

Se reescribe visualmente sin cambiar `materialsQuery`:

- Cabecera de 48 px con la marca `Symma`. No añade `Tutor académico` aquí: ese descriptor pertenece a
  Sym dentro del panel de conversación.
- Botón `Subir material` que abre `UploadManager`; la cola no se encaja en los 224 px del sidebar.
- Lista plana, sin `details` contenedor y sin tarjeta por fila.
- Cada fila enseña nombre truncado a dos líneas, número de páginas y estado con icono.
- Selección mediante fondo tenue y barra de 2 px, no borde redondeado completo.
- Área central con scroll; cabecera y pie no se desplazan.
- Pie con tres IconButton para sistema, claro y oscuro, con `aria-pressed` y tooltip.
- En tablet y móvil, seleccionar material cierra el drawer.

#### `packages/web/src/components/upload/UploadManager.tsx`

Permanece montado desde `App` aunque su diálogo esté cerrado y absorbe el estado que hoy vive dentro de
`UploadDropzone`. Delega la lista visual en `UploadQueue.tsx` y conserva sin reinterpretar:

- selección o arrastre, seguida automáticamente por `validateMaterialsAction` sin escritura;
- estado independiente por fichero y acción de retirar disponible antes de subir;
- botón de confirmación solo cuando todo lo restante es válido;
- rechazo agregado de `maxMaterials` al subir, sin fingir que lo cubrió la prevalidación;
- upload -> indexado -> apuntes por cada material, con progreso y reintento existente;
- refresco de materiales y artefactos al completar.

Cerrar el diálogo solo oculta su presentación. Una validación o cadena iniciada continúa y el botón del
sidebar muestra un indicador discreto mientras haya trabajo; reabrir devuelve la misma cola. No se
persiste la cola al recargar y no se mueve la orquestación al servidor en esta fase.

#### `packages/web/src/components/ui/`

Se crean solo estas primitivas, sin construir un design system abstracto:

- `Icon.tsx`: unión de nombres cerrada y SVG de 16 o 18 px.
- `IconButton.tsx`: botón con label obligatorio y tooltip.
- `Tooltip.tsx`: aparece con hover y foco, nunca contiene acciones.
- `Dialog.tsx`: foco inicial, Escape, devolución de foco y fondo inert.
- `EmptyState.tsx`: título, texto y una acción opcional.
- `StatusNotice.tsx`: info, success, warning y danger con icono y texto.
- `MaterialCitation.tsx`: representación común de cita navegable.

No se crean `Card`, `Stack`, `Box` o componentes equivalentes que solo renombren un `div`.

### 4.3 Escala y tokens visuales

`packages/web/src/styles.input.css` conserva los tokens claros y sustituye el oscuro por:

```css
:root[data-theme="dark"] {
  --color-canvas:        #151218;
  --color-surface:       #1D1922;
  --color-surface-muted: #27212D;
  --color-border:        #39313F;
  --color-border-strong: #72617D;
  --color-heading:       #F7F4FA;
  --color-body:          #DDD7E3;
  --color-muted:         #A79DAD;
  --color-disabled:      #746B7A;
  --color-brand:         #A78BFA;
  --color-brand-soft:    #302442;
  --color-on-brand:      #17121D;
}
```

Contrastes medidos antes de escribir el plan: heading/canvas 17.03:1, body/canvas 13.17:1,
muted/canvas 7.13:1, brand/canvas 6.82:1 y on-brand/brand 6.76:1. `border-strong` sobre surface llega a
3.06:1 para límites de control necesarios. Los tokens semánticos se vuelven a medir en sus
combinaciones reales durante QA.

Escala:

| Uso | Tamaño | Peso | Línea |
| --- | ---: | ---: | ---: |
| Título de pantalla | 22 px | 600 | 1.25 |
| Título de sección | 17 px | 600 | 1.35 |
| Cuerpo y chat | 14 px, chat 15 px | 400 | 1.65 |
| Control | 13 px | 500 | 1.3 |
| Metadato | 12 px | 500 | 1.35 |

Radios: 8 px en controles, 10 px en superficies y 9999 px solo en status, chips y botones circulares.
Sombras solo para elementos superpuestos. Las superficies normales se separan con espacio, tono o un
borde, no con una tarjeta por objeto.

### 4.4 Chat de Sym

`packages/web/src/components/Chat.tsx` queda como coordinador y delega en:

- `chat/ChatHeader.tsx`
- `chat/ChatEmptyState.tsx`
- `chat/ConversationDrawer.tsx`
- `chat/MessageList.tsx`
- `chat/ChatMessage.tsx`
- `chat/AgentActivity.tsx`
- `chat/ContextBar.tsx`
- `chat/ChatComposer.tsx`

Reglas:

- Header de 56 px: `Sym`, descriptor `Tutor académico`, historial y papelera. No dice que la sesión sea
  efímera ni muestra proveedor, modelo o tecnología.
- El botón de historial abre `ConversationDrawer`; ahí viven nueva conversación, lista y borrado. En
  escritorio es un panel superpuesto y en móvil un diálogo de ancho completo. Nunca añade otra
  columna permanente ni ocupa el sidebar de materiales.
- Estado vacío: una frase corta, tres sugerencias ligadas a acciones que el producto puede cumplir y
  el composer. No hay hero de 60 px.
- Mensaje del alumno: ancho máximo 72 por ciento, superficie `brand-soft`, sin etiqueta `TÚ`.
- Mensaje de Sym: ancho máximo 760 px, sin caja, Markdown con Streamdown.
- Tablas y código pueden tener scroll horizontal propio. El texto normal nunca crea un scroll anidado.
- Un turno agrupa su actividad antes de la respuesta final. Cerrado enseña verbo, contador y estado.
  No enseña duración ni tokens porque el contrato no los ofrece como dato de producto. Abierto lista
  llamadas y resultados en el orden persistido y permite ver input/result técnico en un segundo nivel.
- El emparejamiento es secuencial dentro del turno: cada `tool-call` se asocia al siguiente
  `tool-result` pendiente. Si la secuencia está incompleta se muestra `No hay resultado disponible`,
  nunca éxito ni un resultado inventado. Si en el futuro hay herramientas paralelas, será obligatorio
  ampliar el contrato con identidad antes de cambiar esta regla.
- Los fallos de herramienta no se pintan como éxito. El resumen dice qué acción falló y la respuesta
  posterior no oculta el error guardado por fase 4.
- Los nombres `load_skill` y `cli` solo aparecen en detalle técnico. Los labels humanos salen de una
  tabla exhaustiva por tipo de actividad, con fallback `Ejecutando una acción`.
- El detalle técnico puede enseñar herramienta, input, resultado y fallo, pero filtra claves, tokens,
  system prompt, base64 y cuerpos por encima de un techo visual. La vista principal sigue usando
  lenguaje humano incluso cuando la actividad falla.
- ContextBar aparece encima del composer. Cada chip nombra material y superficie, prueba, apunte,
  bloque o página y tiene botón de retirar. Una prueba indica `resolviendo` o `viendo historial`, no
  su tipo inferido por el cliente. Adjuntar no envía. Nunca muestra consumo.
- Las preguntas de seguimiento válidas aparecen debajo de la última respuesta como tres acciones
  compactas. Pulsar una es una decisión explícita del estudiante y la envía por el mismo flujo que
  cualquier mensaje; durante otro envío quedan deshabilitadas.
- Enter envía solo con `!event.shiftKey && !event.nativeEvent.isComposing`.
- El textarea empieza en una línea, ajusta altura por `scrollHeight`, topa en seis y después usa su
  propio scroll. Tiene `resize: none`.
- Durante streaming aparece detener solo si fase 4 expone cancelación real. Si no la expone, no se
  pinta un botón falso.

### 4.5 MaterialPanel y navegación común

`packages/web/src/components/MaterialPanel.tsx` conserva estado y coordinación, y baja de 630 líneas a
un objetivo de 180 o menos. Extrae:

```text
components/material/
  MaterialHeader.tsx
  MaterialTabs.tsx
  MaterialCitation.tsx
  pdf/PdfWorkspace.tsx
  pdf/PdfThumbnailRail.tsx
  pdf/PdfPage.tsx
  mindmap/MindMapWorkspace.tsx
  mindmap/MindMapCanvas.tsx
  mindmap/TopicActionsPopover.tsx
```

La cabecera mide 64 px, enseña título, páginas, estado, `Siguiente paso`, `Ver progreso` y cerrar. Las
tabs usan subrayado y texto, no cuatro píldoras. Al cambiar de pestaña se conserva página PDF, transform
del mapa, bloque seleccionado y grupo de pruebas mientras el material no cambie.

### 4.6 PDF

`PdfWorkspace` compone una tira de 136 px y el lector continuo:

- La tira lista todas las páginas y resalta la activa.
- Cada thumbnail usa IntersectionObserver con 400 px de margen y `materialPageQuery` existente.
- El lector conserva carga diferida con 800 px de margen.
- Un IntersectionObserver del lector actualiza la página activa sin crear una petición.
- Pulsar thumbnail hace scroll a la página y mueve foco al figure.
- Cabecera local: página actual/total, ajustar ancho y zoom visual entre 75 y 150 por ciento.
- El zoom es de presentación CSS; no vuelve a pedir una imagen ni cambia la página fuente.
- La marca `transcrito por el modelo` y el fallo de indexación se conservan.
- Una cita externa cambia a PDF, selecciona la página y aplica un highlight de 1.5 s salvo movimiento
  reducido.

No se cargan 82 miniaturas al abrir. En una prueba manual, DevTools debe mostrar peticiones solo para
las miniaturas próximas y las páginas próximas del lector.

### 4.7 Mapa

`MindMapWorkspace` reutiliza `layoutMindMap` y aplica un grupo SVG transformado por
`CanvasTransform`:

- Pointer down sobre fondo inicia pan y captura el puntero.
- Pointer move desplaza; pointer up/cancel libera captura.
- Wheel con ctrl o trackpad aplica zoom en el cursor y previene scroll solo dentro del canvas.
- Wheel normal desplaza el lienzo, no la página.
- Controles visibles: menos, porcentaje, más y centrar.
- Doble clic en fondo centra.
- Cada nodo es focusable y se activa con Enter o Espacio.
- Activar abre `TopicActionsPopover`, no navega automáticamente.
- Escape cierra popover y devuelve foco al nodo.
- `Ir a apuntes` usa `findBlockForTopic`; sin bloque abre Apuntes con `StatusNotice` explícito.
- `Preguntar a Sym` crea un chip de contexto de fase 4 y cambia foco al composer, pero no envía.
- `Crear Control` conserva el flujo `PendingControl` existente.
- `Abrir páginas` abre la menor página del tema en PDF.

### 4.8 Apuntes

`NoteWorkspace` mantiene un único `NoteDraft`, pero añade `selectedBlockKey`. Extrae
`note/NoteOutline.tsx` y convierte `NoteBlockCard` en `SelectedNoteBlock`.

- Columna izquierda de 220 px con búsqueda local opcional solo si hay 12 o más bloques.
- Cada item muestra encabezado derivado de la primera línea no vacía, autoría, estrella, fuente y badge
  de propuesta.
- Solo se monta el editor del bloque seleccionado.
- Añadir bloque lo inserta después del seleccionado y lo selecciona.
- Reordenar actualiza outline sin perder selección.
- Borrar selecciona el siguiente, o el anterior si era el último.
- Cambiar de bloque conserva el borrador, no llama API y mantiene `Cambios sin guardar`.
- Guardar sigue enviando el apunte completo con los límites actuales.
- Las propuestas se abren desde un contador sobre el outline y seleccionan el bloque afectado cuando
  existe. Insert y remove conservan su comparación actual.
- Cita usa `MaterialCitation` y navega al PDF común. Ya no renderiza otra copia completa de la página
  dentro del bloque.
- En móvil, outline y editor son dos vistas con botón volver.

### 4.9 Pruebas

`AssessmentsTab` conserva generación, solver, historial y Examen real. Añade:

- `assessment/AssessmentGroupTabs.tsx`
- `assessment/AssessmentList.tsx`
- `assessment/StudyProfilePanel.tsx`
- `assessment/NextStudyAction.tsx`

Los tres grupos tienen contador, estado vacío y lista. Cada fila usa separadores, no una tarjeta
completa. Enseña tipo, alcance, origen de repaso, preguntas, último intento y acciones.

`AssessmentsTab` amplía `onActiveArtifactChange` para transportar también `view: "solve" | "history"`
y `MaterialPanel` lo convierte en `AssessmentContextRef` mientras esa vista esté montada. Volver a la
lista lo retira. El chip usa el título para que el estudiante reconozca el contexto; el servidor usa
el id para validar el artefacto y obtener tipo, modo, alcance y material. No se crea contexto para el
formulario de generación ni para una fila con hover o foco.

`StudyProfilePanel` es un Dialog lateral de 400 px y solo lectura:

- Cabecera `Progreso de este material` y fecha de actualización.
- Resumen de actividad sin nota agregada.
- Temas ordenados por el mismo criterio de `nextStudyAction`, cada señal en su propia columna.
- Etiquetas `3 fallos`, `1 pista`, `marcado`, nunca `65% dominado`.
- Acción `Crear prueba de repaso` solo si `canReview` es verdadero.
- Estado vacío que explica qué acciones empiezan a poblar el perfil.
- Error explícito si la consulta falla; no usa un perfil vacío como fallback visual.

La corrección gana una banda de acciones después de la explicación: abrir fuente, preguntar a Sym y
crear repaso. No cambia grading ni recalcula el intento.

### 4.10 Citas y acciones transversales

`MaterialCitation` recibe `materialId`, `pages`, `transcribed`, `unanchoredReason`, label opcional y
`onOpen`. Reemplaza progresivamente `BlockCitation` y `QuestionSourceLine`.

Reglas:

- Cero páginas o cita no anclada no navega y enseña el motivo.
- Material inexistente muestra error y conserva la pantalla actual.
- Material distinto cambia selección antes de abrir PDF.
- Varias páginas abre la primera y conserva toda la lista en el label.
- La procedencia transcrita se ve siempre.
- Las citas del chat solo usan `ConversationSource`, descrito en la sección 5. No se detecta
  `página 12` en Markdown ni se convierte una mención del modelo en procedencia verificada.

Acciones contextuales disponibles:

| Origen | Acciones |
| --- | --- |
| Página PDF | Preguntar a Sym, copiar referencia |
| Tema | Abrir páginas, ir a apuntes, crear Control, preguntar a Sym |
| Bloque | Preguntar a Sym, abrir fuente |
| Corrección | Abrir fuente, preguntar a Sym, crear repaso |

Todas las acciones que mandan contexto terminan en ContextBar, no envían por sí mismas.

### 4.11 Estados, accesibilidad y rendimiento

Cada consulta o stream tiene cuatro representaciones separadas: inicial, cargando con progreso cuando
existe, error recuperable y éxito. `no data` no reutiliza el estado vacío de éxito.

Requisitos:

- Foco visible 2 px con offset en ambos temas.
- Target mínimo 40 por 40 px en controles primarios y 32 por 32 en acciones compactas de escritorio.
- Todos los iconos accionables con label.
- Orden DOM igual al orden visual.
- Ningún `outline: none` sin sustitución visible.
- Diálogos con foco atrapado; popovers no modales con Escape y devolución de foco.
- `aria-live` polite para progreso; assertive solo para bloqueo de examen y error de envío.
- Movimiento reducido elimina smooth scroll, highlight animado y transiciones de panel.
- PDF y miniaturas diferidos.
- Un único TipTap montado en Apuntes.
- Mapa transforma un grupo SVG y no recalcula layout en cada pointermove.
- Chat añade eventos al turno actual sin rerenderizar MaterialPanel.

## 5. Trabajo fullstack mínimo que habilita la experiencia

El cierre de 4G identifica tres contratos pequeños. Solo §5.1 se implementa y prueba antes del
rediseño de Chat porque evita exponer contexto técnico y recupera correctamente el historial visible.
§5.2 y §5.3 quedan definidos para P3: si no entran en calendario, los componentes conservan el
contexto de fase 4 y no simulan datos que el servidor todavía no conoce.

### 5.1 Turno visible separado del prompt del modelo · P0, excepción backend

`ConversationTurn` añade `input` con el texto literal escrito por el estudiante, `context` con las
referencias aceptadas al enviar, `messageCount` con cuántos mensajes internos produjo ese turno y
`followUpQuestions` con el array ya validado por `extractFollowUp`. El historial interno de
`AgentMessage` conserva el bloque de contexto que necesita el modelo, pero la interfaz reconstruye la
entrada desde `turn.input`, los chips desde `turn.context` y corta la secuencia plana con
`messageCount`; nunca muestra ni elimina delimitadores mediante regex en render.

Esto se aplica tanto al historial recargado como al turno que llega por stream. La burbuja del alumno
recibe exclusivamente `input`; el texto canónico `The student is currently looking at...`, los
delimitadores `SCREEN CONTEXT` y los ids no forman parte de ningún payload de presentación. El contexto
sí sigue siendo visible antes de enviar como chips breves y retirables: ocultar el bloque técnico no
autoriza a mandar contexto secreto. `MaterialSurface` mejora qué dice uno de esos chips y qué entiende
Sym, pero no es el mecanismo que separa el prompt interno de la conversación visible.

`TutorChatService.runTurn` recibe ambos valores antes de construir `turnInput` y los entrega a
`appendTurn`, junto a `result.followUpQuestions`. El decoder de sesiones admite el formato anterior.
Una migración determinista reconoce solo el sufijo canónico exacto que escribió `renderScreenContext`
y conserva el texto previo como input; no intenta reconstruir chips antiguos parseando títulos o ids.
Para el último mensaje de asistente de cada turno antiguo, ejecuta `extractFollowUp` sobre una copia de
presentación: recupera las tres preguntas del caso sin cierre y limpia el texto visible, sin modificar
el historial que el agente usa como contexto. Si una sesión antigua no se puede migrar con certeza,
marca ese turno como dato de presentación no disponible y no enseña el bloque técnico.

Al recargar, solo `followUpQuestions` del último turno terminado se muestran como acciones. Los turnos
anteriores las conservan para fidelidad del historial, pero no llenan cada respuesta pasada de botones.
Si el array falta y el texto antiguo ya estaba limpio, queda vacío: no se regeneran preguntas.

La sesión de regresión observada con `Hola` seguido de `Puedes ver lo que tengo abierto?` se conserva
como fixture anonimizado: al cargarla, la segunda burbuja contiene solo la pregunta; material y apunte
aparecen como chips; la respuesta recupera sus tres botones; y ni
`The student is currently looking at`, ni `id:`, ni `<<<` llegan al DOM.

Si la suma de `messageCount` y el historial no coincide, el API devuelve un error de lectura declarado y el
diagnóstico nombra la conversación; no desplaza mensajes a otro turno ni intenta adivinar el corte.

### 5.2 Superficie, prueba y página visibles como contexto · P3

`packages/shared/src/schemas/chat-context.ts` amplía el material, especializa la prueba abierta y
añade la página:

```ts
type MaterialSurface = "pdf" | "mindmap" | "notes" | "assessments";

type MaterialContextRef = {
  readonly type: "material";
  readonly materialId: string;
  readonly title: string;
  readonly surface: MaterialSurface;
};

type AssessmentContextRef = {
  readonly type: "assessment";
  readonly artifactId: string;
  readonly title: string;
  readonly view: "solve" | "history";
};

type PageContextRef = {
  readonly type: "page";
  readonly materialId: string;
  readonly page: number;
  readonly title: string;
};
```

`MaterialPanel` informa siempre de la superficie activa y `renderScreenContext` la traduce al
vocabulario visible `PDF`, `Mapa`, `Apuntes` o `Pruebas`. Así Sym puede decir en qué zona está el
estudiante sin deducirla a partir de que exista o no un artefacto. En servidor, además, se valida que
material y página existen antes de describirlos al agente.

`AssessmentContextRef` reemplaza al `ArtifactContextRef` genérico solo para la pestaña Pruebas. En la
lista no existe. Al abrir `solve` o `history`, lleva el `artifactId` y el título exactos que ya posee
`AssessmentsTab`; el servidor carga ese artefacto, comprueba que sea `quiz` o `test` y que pertenezca al
material visible, y deriva de datos reales si es `Control` o `Examen de prueba`. `view` describe
únicamente la vista de interfaz. El cliente no envía `kind`, `mode` ni `scope`, y Sym no usa el título
para adivinarlos. Un Examen real nunca adjunta este contexto porque al empezar sustituye el shell y el
chat deja de estar disponible.

La referencia no afirma qué intento o pregunta mira el estudiante. El historial muestra una lista y
el solver presenta todas las preguntas; incluso cuando `AttemptHistory` expande una corrección, ese
estado todavía no forma parte del contrato visible y retirable. Si más adelante se diseña una
selección única, se añadirá un puntero validado dentro de la misma referencia. No se enviará el último
intento ni la pregunta más cercana al viewport de forma implícita.

La acción `Preguntar a Sym` del PDF crea el chip de página; el usuario lo ve y puede retirarlo antes de
enviar. Ninguna referencia transporta texto del PDF. `maxContextRefs` sigue siendo 3 porque la
superficie viaja dentro de la referencia de material. El conjunto máximo es material, contexto de
apunte o prueba, y bloque o página activa; no se acumula sin fin. La prueba especializada ocupa el
mismo hueco que antes ocupaba `artifact`. Al añadir una página del mismo material se reemplaza la
página anterior.

### 5.3 Fuentes consultadas por el chat · P3

`packages/shared/src/schemas/conversation.ts` añade una procedencia mínima:

```ts
type ConversationSource = {
  readonly materialId: string;
  readonly title: string;
  readonly pages: readonly number[];
  readonly transcribedPages: readonly number[];
};
```

`ConversationTurn` guarda `sources` y el stream de tutor emite `source` cuando se confirma una nueva.
El servidor la deriva de una llamada completada con éxito a lectura o vista de material, valida el
material y las páginas y deduplica por material y página. Una llamada fallida no crea fuente. No se
acepta una cita escrita por el modelo ni se parsea el texto final. La interfaz las presenta como
`Fuentes consultadas`, no como afirmación de que cada frase de la respuesta esté demostrada por todas
ellas.

Los mensajes históricos ya permiten agrupar actividad por turno y orden. No se añaden `callId`,
duración ni consumo al contrato visual. Si el código real demuestra que dos herramientas pueden
ejecutarse en paralelo, se detiene 5C y se añade identidad real; no se emparejan por semejanza.

El vínculo tema-apunte sigue usando material y páginas existentes y no añade `topicId` a NoteBlock.
Los demás contratos de sesión, subida, borrado y perfil se consumen tal como quedaron en fases 3 y 4.

### 5.4 Límites · P0 para actividad visible, P3 para contratos nuevos

Los límites de mensaje, contexto, fichero, preguntas, bloques, pasos y páginas ya viven en
`packages/shared/src/limits.ts`. `ConversationSource.pages` queda acotado por el presupuesto por turno
que ya limita las lecturas. El detalle técnico de actividad necesita además un techo visual declarado
para caracteres por resultado antes de implementarse; se añade a `LIMITS` y, al superarlo, se muestra
que el detalle está abreviado. El dato persistido no se recorta por esta decisión de presentación.

## 6. Identidad y texto canónico

### 6.1 Identidad visible

Copy estable que no se reescribe durante implementación:

```text
Symma
Sym
Tutor académico
Progreso de este material
Siguiente paso
Preguntar a Sym
Abrir fuente
Crear prueba de repaso
No hay datos suficientes todavía.
No hemos podido completar esta acción. Tus datos anteriores siguen guardados. Vuelve a intentarlo.
No hemos podido conectar con Sym. Comprueba tu conexión y vuelve a intentarlo.
Esta conversación ya es muy larga. Empieza una nueva para poder seguir estudiando.
No hemos podido abrir esta página. El resto del material sigue disponible.
```

`Symma` solo aparece como marca del producto. `Sym` aparece como autor de la conversación y en las
acciones que abren o adjuntan contexto al chat. `Tutor académico` es el único descriptor visible: no se
alternan `asistente`, `compañero`, `IA`, `modelo` o `tutor de Proxus`.

Los mensajes de error son fallbacks. Cuando un error de dominio conocido permita ser más útil, la capa
de presentación añade la causa humana y una acción concreta. No concatena después el mensaje técnico
(`${message}`) ni lo oculta en un tooltip. El detalle técnico va exclusivamente al canal de diagnóstico
o al segundo nivel de actividad del agente.

### 6.2 Identidad canónica de Sym

`packages/server/src/domain/agents/academic-tutor.ts` cambia solo el preámbulo de identidad del system
prompt. La fuente canónica queda en inglés, como el resto del prompt, y contiene literalmente estas
reglas antes de `## Language`:

```text
You are Sym, the academic tutor inside Symma. Symma is the student's study workspace for their own
uploaded PDF materials, study notes, quizzes, exams, and study profile.

The student talks to you from Symma's chat panel. You always know your name, your role, the product you
are in, and the visible interface vocabulary: PDF, Mapa, Apuntes, and Pruebas.

You do not know which material, tab, page, assessment, artifact, or note block the student is currently viewing
unless it is present in the structured screen context of this turn. Never claim to see or have open
anything that is not in that context. When no screen context is attached, say what you need instead of
guessing.
```

El resto del system prompt conserva reglas de idioma, datos reales, herramientas, citas, límites,
capacidades y follow-up. No se añade una biografía, tono artificial ni frases como `soy una IA`. Ante
`¿quién eres?`, Sym puede responder `Soy Sym, tu tutor académico en Symma`; ante `¿dónde estoy?`, sabe
que está dentro de Symma, pero no inventa material o pestaña.

Todas las llamadas del harness ya incluyen este system prompt mediante `renderPrompt`. No se añade la
identidad a `TutorChatRequest`, al mensaje del usuario, a cada tool call ni a cada skill. Así se mantiene
una sola autoridad, se preserva la caché del prefijo y no se pagan tokens duplicados en cada paso.

### 6.3 Auditoría de prompts, herramientas y copy

| Superficie | Acción de fase 5 |
| --- | --- |
| `packages/server/src/domain/agents/academic-tutor.ts` | Sustituir `academic tutor of Proxus` por el bloque canónico de Sym/Symma y conservar el resto del contrato. |
| `packages/server/src/domain/agents/harness/screen-context.ts` | Incorporar superficie, prueba y página; resolver la prueba por id y describir solo referencias presentes. Nunca convertir identidad de producto en ubicación de pantalla. |
| `packages/server/src/domain/agents/academic-tutor/skills/*.ts` | Revisar las cinco skills para que usen exactamente `PDF`, `Mapa`, `Apuntes` y `Pruebas`. No repetir quién es Sym en sus cuerpos. |
| Descripciones de `load_skill`, `cli` y comandos | Mantener nombres y schemas internos. Las herramientas no necesitan conocer la marca ni cambiar de nombre. |
| Prompts de indexación, apuntes, preguntas, juez, reescritura y URL | Buscar referencias a Proxus, tutor o agente y eliminarlas si existen. No añadir Sym/Symma: son servicios impersonales. |
| `packages/web/src` | Sustituir `Proxus Tutor`, `Asistente académico`, `Tutor académico` como título, `Nexo` y `Compañero de estudio` por la jerarquía exacta Symma > Sym > Tutor académico. |
| Eval del tutor y guardarraíles | Añadir identidad, producto y límite de percepción de pantalla; conservar selección de skill, idioma, citas e invariantes existentes. |
| `docs/ai-agent.md`, `docs/architecture.md`, `NOTES.md`, `CHANGELOG.md` | Documentar la identidad de producto sin renombrar tipos internos que siguen describiendo correctamente el dominio. |

Los nombres internos `AcademicTutor`, `TutorChatService`, `TutorApi`, rutas `/tutor` y fichero
`academic-tutor.ts` permanecen. Son nombres técnicos correctos y cambiarlos no mejora la experiencia;
la identidad de marca vive en prompt y presentación.

### 6.4 Pruebas específicas de identidad y ubicación

En P0 se ejecutan los casos de identidad, ausencia de contexto y separación entre presentación y
prompt interno. Los casos de página, bloque, superficie y prueba exacta se activan en P3 junto a sus
contratos; hasta entonces no forman parte del cierre exigible ni se afirma que Sym conozca esos datos.

- Sin contexto, `¿Quién eres y dónde estoy?` responde en español que es Sym, tutor académico dentro de
  Symma, sin mencionar Proxus, Google, Gemini, modelo o una pestaña concreta.
- Con contexto de material y página, puede nombrarlos; al retirar el chip, deja de afirmar que los está
  viendo. El test inspecciona el request y la respuesta.
- Con contexto de bloque, entiende que el estudiante está en ese bloque de Apuntes; no lo confunde con
  una sección del PDF.
- En la lista de Pruebas solo puede nombrar la pestaña. Al abrir un Control o Examen de prueba, puede
  nombrar exactamente cuál es y si se está resolviendo o viendo su historial porque recibe
  `AssessmentContextRef`. Retirar ese chip elimina esa afirmación del turno.
- Un `artifactId` que apunte a un apunte, a otro material o a un artefacto inexistente se rechaza con
  error declarado. Tipo y modo se resuelven en servidor; el test usa títulos ambiguos para demostrar
  que Sym no los infiere del copy.
- Durante un Examen real no hay chat ni contexto de Sym. En historial, Sym no nombra un intento o una
  pregunta concreta mientras la interfaz no los exponga como referencia visible y retirable.
- Ante una acción que pertenece a la interfaz, como crear un Examen, remite a `Pruebas` y no afirma que
  Sym pueda hacerlo desde el chat.
- Generar un apunte, una prueba o una corrección no introduce `Sym`, `Symma` ni texto conversacional en
  el artefacto.
- Un barrido sensible a mayúsculas falla si queda `Nexo`, `Proxus Tutor`, `Asistente académico` o
  `Compañero de estudio` en copy visible o en la identidad canónica.

## 7. Orden de ejecución

### Regla de interrupción

Solo un fallo de clase A interrumpe el orden de prioridad:

- crash o ruta principal inutilizable;
- pérdida, sobrescritura o corrupción de datos;
- prompt, JSON, id, stack, ruta local, secreto, base64 o mensaje técnico visible para el estudiante;
- error presentado como éxito o ausencia de datos presentada como cero.

Una regresión visual del nivel activo se corrige antes de avanzar. Un borde protegido por servidor,
una mejora de backend o un refinamiento de una prioridad posterior se anota y espera. Cada nivel termina
con typecheck, build, tests y recorrido manual; si se acaba el tiempo, se cierra documentación y captura
en ese punto.

### P0 · Entrega no negociable: identidad, seguridad visual y rediseño completo

P0 debe quedar terminado aunque no se implemente nada más. Se ejecuta en dos sesiones deliberadas:
la primera deja una base visual estable y la segunda completa el chat, la privacidad y el cierre. Cada
sesión termina en verde, pero solo el cierre de la segunda permite declarar P0 terminada.

#### Sesión P0.1 · Base visual y escritorio

1. **Fijar el snapshot.** Registrar el commit final de fase 4, ejecutar los checks existentes y crear
   en `docs/especificacion.md` los criterios F5 con etiqueta P0, P1, P2 o P3. El borde acumulado del
   uploader se registra como P3 y no bloquea.
2. **Establecer la identidad.** Cambiar la identidad canónica a Sym/Symma y comprobar que ningún prompt
   de servicio la imita. No modificar todavía el contrato del chat ni su historial.
3. **Crear la frontera de comunicación.** Implementar y probar `user-feedback.ts`, sustituir todo uso
   visible de mensajes crudos y mantener ErrorBoundary por superficie. Un fallo inesperado conserva
   diagnóstico técnico redactado en consola o servidor, pero la pantalla explica qué ocurrió y qué
   puede hacer el estudiante.
4. **Aplicar el suelo visual.** Tema oscuro carbón violeta, escala tipográfica, radios, espaciado, foco,
   movimiento reducido y primitivas de `components/ui`. Comprobar contraste y eliminar el patrón de una
   tarjeta redondeada por objeto.
5. **Construir el escritorio.** AppShell, sidebar fijo de 224 px, split Material/Sym, cierre explícito
   del material, ratio persistido y estado inicial con Sym a ancho completo. Mantener una salida usable
   en tablet y móvil sin prometer adaptación específica; el drawer y el responsive completo son P3.
6. **Rediseñar sidebar y subida.** Marca Symma, lista plana de materiales, tema al pie y botón que abre
   UploadManager. Conservar validate, retirada, confirmación y progreso. Cerrar el diálogo no desmonta
   una cadena iniciada; el borde de dos selecciones sucesivas no se reimplementa aún.
7. **Dar coherencia a todo MaterialPanel sin añadir aún comportamiento caro.** Extraer MaterialHeader y
   MaterialTabs; aplicar la nueva jerarquía visual a PDF, Mapa, Apuntes, Pruebas, solver, historial,
   perfil y ExamRun usando su comportamiento actual. No implementar todavía miniaturas, outline,
   pan/zoom ni los contratos P3.

**Cierre de P0.1.** Ejecutar typecheck, build, tests y un recorrido de alta, subida, selección, cuatro
pestañas, intento de práctica y examen real. Capturar escritorio claro y oscuro. No iniciar la
migración de §5.1 si no puede terminarse junto al nuevo chat en P0.2. Este es un checkpoint técnico
estable, no la entrega final de P0.

#### Sesión P0.2 · Sym, privacidad y acabado

8. **Separar conversación visible y prompt interno.** Implementar §5.1 de extremo a extremo para que
   stream, recarga y sesiones antiguas nunca enseñen `SCREEN CONTEXT`, ids o delimitadores y conserven
   los follow-ups válidos. La migración y el render nuevo entran juntos; no se deja compatibilidad a
   medias entre sesiones.
9. **Rediseñar Sym.** ChatHeader, ConversationDrawer, mensajes Markdown, composer con Enter,
   Shift+Enter, IME y autosize, papelera real, follow-ups compactos y estado vacío sobrio. La respuesta
   no vive en tarjeta y el historial no ocupa una columna permanente.
10. **Contener la actividad del agente.** Agrupar por turno y orden real, mostrar resumen humano y
   estados running/success/failure. El detalle técnico es secundario, filtrado y abreviado; nunca pinta
   el `result` crudo ni consumo. Probar explícitamente tool-result con base64, fallo y resultado enorme.

**Cierre de P0.2 y de P0.** Hacer el pase final de coherencia sobre shell, MaterialPanel y Sym. Recorrer
alta, subida, selección, cuatro pestañas, chat, actividad, historial, intento de práctica, examen real,
borrado y errores conocidos. Ejecutar checks, auditar todo texto visible y capturar desktop en claro y
oscuro. Al terminar no queda ninguna pantalla con el estilo anterior, ningún mensaje técnico visible
ni una migración incompleta. Si el calendario termina aquí, actualizar documentación y entregar.

### P1 · Mayor impacto de uso: superficies de estudio

11. Construir PdfWorkspace con tira diferida, página activa, navegación directa, ajuste y zoom visual.
12. Construir NoteOutline y selección de un bloque manteniendo un solo TipTap y el borrador global.
13. Separar Pruebas en Controles, Exámenes de prueba y Exámenes reales, reutilizando solver, historial y
    ExamRun. Integrar el panel de progreso existente sin inventar porcentaje de dominio.
14. Unificar MaterialCitation para apuntes y correcciones, con navegación segura al PDF y estado sin
    ancla. Conectar tema -> apunte mediante el solape determinista ya definido.
15. Cerrar P1 con teclado y foco en escritorio a 1280x720, 1440x900 y 1920x1080; comprobar un solo
    editor, carga PDF incremental y que todas las rutas principales siguen usando mensajes humanos.
    Ejecutar checks, documentar y capturar. Si termina el tiempo, entregar aquí.

### P2 · Refinamiento y diferenciación

16. Implementar MindMapCanvas con pan, zoom en cursor, centrar, teclado y TopicActionsPopover.
17. Implementar NextStudyAction y las acciones fuente, Sym y repaso, manteniendo separadas las señales
    del perfil.
18. Perfilar React y red: mapa sin relayout por pointermove, chat aislado de MaterialPanel, un TipTap y
    PDF diferido. Corregir solo problemas medidos.
19. Completar el barrido de lector de pantalla, zoom 200 por ciento, contraste, movimiento reducido y
    estados vacíos, carga, límite y no data.
20. Cerrar P2 con recorrido completo, checks, documentación y capturas de ambos temas en los tres
    anchos de escritorio. Si termina el tiempo, entregar aquí.

### P3 · Backend, responsive y mejoras opcionales

21. Implementar `MaterialSurface`, `AssessmentContextRef` y `PageContextRef` con validación en servidor,
    chips retirables y las pruebas de ubicación de §6.4. Hasta entonces se conserva el contexto de fase
    4 sin afirmar pestaña, página o vista que Sym no conoce.
22. Implementar `ConversationSource`, persistencia, deduplicación y `Fuentes consultadas`; no inferir
    citas desde Markdown.
23. Revisar la cola acumulada del uploader. Si se decide corregirla, revalidar toda la cola al añadir
    otro lote, ignorar respuestas asíncronas antiguas y probar duplicado y `maxFilesPerUpload` repartidos
    entre dos selecciones. No tocar el endpoint si la medición no justifica el coste.
24. Ejecutar las pruebas completas de identidad y ubicación, fuentes durante stream y recarga, y
    contexto de prueba exacta. Actualizar contratos y documentación solo de lo realmente construido.
25. Completar responsive al final: selector Material/Sym en tablet y sidebar como drawer accesible en
    móvil. Probar 1024x768 y 390x844 sin rebajar la calidad ya cerrada para escritorio.
26. Contraer también el panel de Sym a un rail, para dejar Apuntes a pantalla completa (petición de
    Iván tras las correcciones de cierre; hoy `AppShell` solo contrae sidebar e índice de bloques, y el
    plan de correcciones §9 excluye "ocultar a cero" un panel). Es un cuarto estado de layout: rail con
    control de restaurar, persistencia, teclado y comportamiento del separador. Encaja aquí junto a la
    superficie de estudio ampliada, no en el corte de correcciones.
27. Cierre final opcional: recorrido completo, tests, typecheck, build, logs, capturas y changelog.

## 8. Cómo se sabe que funciona

Los criterios EARS F5-01 a F5-44 viven en `docs/especificacion.md`, apartado `Fase 5 · El escritorio
de estudio`. Cada uno se etiqueta con su prioridad para que una entrega parcial sea honesta y
verificable:

| Prioridad | Criterios | Corte de entrega |
| --- | --- | --- |
| P0 | F5-01 a F5-04, F5-07 a F5-16, F5-34, F5-37 a F5-39, F5-42 y F5-43 | Escritorio, sidebar, chat, actividad segura, comunicación humana, identidad y todas las superficies actuales con el nuevo lenguaje visual. |
| P1 | F5-19 a F5-21 y F5-25 a F5-30 | PDF con miniaturas, Apuntes por bloque y Pruebas agrupadas. |
| P2 | F5-22 a F5-24, F5-31 a F5-33, F5-35 y F5-36 | Mapa manipulable, siguiente paso, accesibilidad exhaustiva y rendimiento medido. |
| P3 | F5-05 a F5-06, F5-17 a F5-18, F5-40, F5-41 y F5-44 | Responsive completo, contexto estructurado ampliado, página, fuentes del chat y ubicación exacta de Sym. |

No se borra un criterio si no entra: queda marcado `deferred` con su prioridad y no se incluye en las
afirmaciones del CHANGELOG ni del recorrido entregado. Este plan guarda el procedimiento y no repite
el texto EARS.

### 8.1 Checks automáticos

Desde la raíz:

```bash
pnpm run typecheck
pnpm --filter @proxus/web run build
pnpm --filter @proxus/server run typecheck
pnpm test
```

En P0 el backend solo cambia la identidad canónica del tutor y la separación entre el turno visible y
el prompt interno; los demás prompts se auditan sin añadirles marca. La batería de guardarraíles y la
eval del tutor se ejecutan tras esos cambios y en cada cierre posterior que modifique contexto:

```bash
pnpm run test:guardarrailes
```

### 8.2 Procedimiento por grupo

| Criterios | Prueba |
| --- | --- |
| F5-01 a F5-04, shell | Abrir a 1440x900 sin material: 224 px de sidebar y Sym ocupa el resto. Abrir `densidad.pdf`: aparece split 58/42. Arrastrar a ambos extremos: ninguno baja de 420 px. Recargar: conserva ratio. Cerrar material: vuelve a Sym completo. |
| F5-05 a F5-06, responsive | Probar 1024x768: una sola superficie y selector Material/Sym. Probar 390x844: sidebar en drawer, foco atrapado, Escape lo cierra y seleccionar material también. |
| F5-07 a F5-09, sidebar, subida y tema | Confirmar lista plana, solo materiales, botón de subida y tres iconos de tema al pie. Elegir juntos un PDF válido y otro inválido: no se escribe ninguno durante `validate`, ambos se ven con estado, el botón permanece bloqueado y la X permite retirar el rechazado. Subir el válido, cerrar y reabrir: la cola y el progreso continúan. Cambiar sistema/claro/oscuro y recargar. Forzar artefacto ilegible: aviso global, no sección nueva en sidebar. |
| F5-10 a F5-13, chat | Escribir dos líneas con Shift+Enter; Enter envía; probar IME sin envío prematuro; pegar siete líneas y comprobar tope visual a seis. Respuesta Markdown con lista, tabla y bloque de código: solo tabla/código tienen scroll horizontal. |
| F5-14 a F5-16, actividad | Pedir `lista mis materiales`. Cerrado: un resumen humano. Abierto: pasos emparejados en orden. Provocar comando fallido: estado failure persistente después de recargar. Nunca enseñar JSON en el nivel principal. |
| F5-17 a F5-18, contexto | Desde un topic pulsar Preguntar a Sym. Ver chip antes de enviar, retirarlo y enviar: DevTools confirma que no viajó. Repetir sin retirarlo y comprobar el contexto en sesión. |
| F5-19 a F5-21, PDF y citas | Abrir fixture, recorrer thumbnails y ver sincronía de página activa. DevTools al abrir no muestra una petición por cada página. Pulsar una cita de apunte y otra de corrección: ambas abren el material y página correctos. Cita sin ancla enseña motivo y no navega. |
| F5-22 a F5-24, mapa | Arrastrar fondo, zoom en cursor, centrar, activar nodo con teclado y cerrar menú con Escape. Cada una de las cuatro acciones llega a su destino. El canvas no muestra barras para recorrer el grafo. |
| F5-25 a F5-27, apuntes | Generar apunte de varios temas. Solo hay un editor TipTap en DOM. Editar bloque A, cambiar a B y volver: texto sigue en borrador y no se llamó PUT. Guardar y recargar. Tema del mapa abre el bloque con mayor solape. Sin bloque muestra aviso. |
| F5-28 a F5-30, pruebas | Crear Control, Examen de prueba y Examen real: aparecen en sus tres grupos. Una prueba review conserva badge. Solver e historial funcionan. En la lista Sym solo conoce `Pruebas`; al abrir solver o historial el chip nombra el artefacto exacto y el servidor valida si es Control o Examen de prueba. Examen real elimina shell y chat completos y al salir los restaura. |
| F5-31 a F5-33, progreso | Con perfil vacío, panel explica cómo poblarlo. Fallar dos preguntas, abrir una pista y marcar un bloque: las tres señales aparecen separadas. Siguiente paso elige fallos antes que pistas, y pistas antes que énfasis, nombrando solo el motivo ganador. |
| F5-34, no data | Romper lectura de perfil y carga de una página por separado. La interfaz dice que no hay datos o que falló; nunca enseña cero, porcentaje neutro ni pantalla vacía. |
| F5-35, accesibilidad | Recorrer toda la app solo con Tab, Shift+Tab, flechas, Enter, Espacio y Escape. Ejecutar inspección de roles/nombres, zoom del navegador al 200 por ciento y contraste en ambos temas. |
| F5-36, rendimiento | React Profiler: escribir en chat no rerenderiza PDF o TipTap; pan del mapa no recalcula layout; Apuntes monta un editor; red del PDF es incremental. |
| F5-37 a F5-38, comunicación y diagnóstico | Forzar `SchemaError`, fallo de red, 500 con mensaje técnico y límite conocido en cuatro superficies. La pantalla explica la operación afectada y el siguiente paso sin repetir el texto técnico; consola o log sí conserva causa, operación y superficie una sola vez. |
| F5-39, historial y seguimiento | Abrir historial desde Sym sin alterar el sidebar de materiales, cambiar y borrar conversación, recargar y usar una pregunta de seguimiento válida. La burbuja del alumno solo enseña lo que escribió; el contexto interno reaparece como chips, nunca como `SCREEN CONTEXT`, ids o frase inglesa. Forzar tres preguntas sin cierre, recargar y comprobar que siguen los tres botones sin delimitadores. Forzar dos: cero botones antes y después de recargar. |
| F5-40, contexto de página | Desde PDF adjuntar página 7, comprobar el chip antes de enviar, retirarlo y verificar que no viaja. Adjuntarlo otra vez reemplaza la página previa del mismo material y el servidor valida el rango. |
| F5-41, fuentes del chat | Pedir una explicación que lea dos páginas. Durante stream y tras recarga aparecen las mismas fuentes deduplicadas. Una lectura fallida no crea fuente y ninguna mención textual `página N` se convierte sola en cita. |
| F5-42, detalle técnico seguro | Desplegar actividad con llamada correcta, resultado grande y fallo. El nivel principal sigue siendo humano; el detalle abreviado conserva información útil, no enseña claves, base64, system prompt ni consumo de tokens. |
| F5-43, identidad visible | Sidebar muestra `Symma`; el chat muestra `Sym` y `Tutor académico`; acciones dicen `Preguntar a Sym`. El barrido no encuentra nombres retirados en copy visible. |
| F5-44, identidad y ubicación del agente | Preguntar quién es y dónde está con contexto vacío, material, página, bloque, lista de Pruebas, Control abierto y Examen de prueba abierto. Sym mantiene identidad Symma/Sym, solo nombra ubicación adjunta, distingue solver de historial y no inventa intento ni pregunta. Retirar cada chip elimina esa afirmación. Durante Examen real no existe chat. Las generaciones impersonales no incluyen la marca. |

### 8.3 Recorrido final del evaluador

Este es el recorrido acumulado si se completa P3. Si el calendario se cierra antes, se usa únicamente
el subconjunto correspondiente al último nivel verde y se eliminan de la demo y del changelog las
capacidades diferidas; nunca se representan como terminadas.

Con `pnpm run seed:demo` y `pnpm dev`:

1. Abrir la aplicación y ver `Symma` en el sidebar y `Sym · Tutor académico` como inicio.
2. Elegir `densidad.pdf` junto a un fichero inválido, retirar el rechazo, subir el PDF y observar
   validación y preparación como estados distintos.
3. Abrir mapa, seleccionar tema y preguntar a Sym con chip visible.
4. Abrir el apunte del tema, editarlo, marcarlo y aceptar una propuesta.
5. Crear un Control, fallar una pregunta, abrir su fuente y discrepar de una respuesta corta.
6. Abrir Progreso y generar repaso desde el motivo mostrado.
7. Crear Examen real y confirmar que el escritorio desaparece hasta terminar o cancelar.
8. Volver al chat, desplegar la actividad y recargar para comprobar historial.

## 9. Fuera de alcance

- Perfil de cuenta, avatar, autenticación, base de datos o varios usuarios.
- Perfil combinado entre materiales.
- Porcentaje de dominio o score compuesto de señales.
- Calendario, repaso espaciado, estadísticas históricas o rachas.
- Pomodoro, gamificación, rankings, logros y funciones sociales.
- Flashcards, podcast, audio, transcripción de clase o exportación.
- Generar preguntas de seguimiento en cliente o usarlas como decoración del estado vacío.
- Preguntas de desarrollo largo y editor manual de preguntas.
- Contexto de intento o pregunta concreta mientras Pruebas no tenga una selección única, visible y
  retirable para esos niveles.
- Controles, Exámenes o Apuntes en el sidebar.
- Router y URLs profundas. La navegación interna sigue siendo estado de aplicación.
- Nueva librería de componentes, iconos, split panes, PDF o pan/zoom.
- Miniaturas generadas por un endpoint nuevo.
- Cambiar el modelo de persistencia local.
- Identidad `callId` y duración medida por herramienta. No son necesarias mientras las herramientas se
  ejecuten en serie. Si sobra tiempo después de F5-44, pueden añadirse como mejora aislada con id
  generado en el harness y marcas `startedAt`/`completedAt`; la interfaz solo las mostrará después de
  probar emparejamiento, persistencia y recarga. Nunca se estimará una duración desde la animación.
- Reabrir las reglas de prompt injection, herramientas, citas o capacidades del agente. Fase 5 cambia
  la identidad canónica y su conocimiento del producto, no las barreras cerradas en fase 4.
- Rehacer ExamRun visualmente más allá de adoptar tokens y accesibilidad sin cambiar su aislamiento.

## 10. Riesgos conocidos

1. **Una entrega parcial puede parecer una promesa incumplida.** Los criterios llevan prioridad y cada
   cierre documenta solo lo construido. No se mezcla una tarea P1 a medias dentro de un corte P0 ni se
   afirma en CHANGELOG algo que quedó `deferred`.
2. **P0 sigue siendo amplio porque toda la app debe dejar de parecer la plantilla inicial.** Se cambia
   primero jerarquía y presentación de todas las superficies usando su comportamiento existente; las
   interacciones nuevas se reservan para P1 y P2. Cada paso mantiene build y recorridos principales.
3. **PDF thumbnails reutiliza imágenes grandes.** Lazy loading evita el pico inicial, pero recorrer una
   tira de 82 páginas termina descargándolas. Un endpoint de thumbnail queda fuera porque añade
   backend, caché y límites; se mide antes de reabrir esa decisión.
4. **Tema a bloque se infiere por páginas.** Dos topics pueden compartir todas sus páginas. El empate
   por orden es determinista y visible, pero no semánticamente perfecto. Si el corpus real demuestra
   ambigüedad frecuente, una fase futura puede persistir topicId; no se cambia el contrato por un caso
   no medido.
5. **El mapa con SVG grande puede perder fluidez.** Transformar un solo grupo y conservar layout memoizado
   reduce coste. Se mide con el máximo `maxTopicsPerMaterial`; no se añade canvas sin medición.
6. **Una sola edición de bloque cambia el modelo visual, no el de guardado.** El PUT de hasta 1 MB sigue
   siendo deuda conocida. No se convierte a operaciones por bloque en esta fase.
7. **La recomendación puede parecer más inteligente de lo que es.** El copy nombra la regla y su dato;
   nunca dice `dominas`, `predice` o `reciente`, porque el perfil no guarda dominio ni recencia por tema.
8. **Responsive puede multiplicar estados.** Desktop es el recorrido principal del challenge y se
   cierra primero en P0, P1 y P2. La adaptación específica se difiere a P3; tablet y móvil usan una
   sola superficie en vez de intentar encoger el split.
9. **Los detalles de actividad pueden exponer información interna.** El nivel principal es humano y el
   segundo nivel filtra secretos, system prompt, base64 y resultados desproporcionados. La prueba F5-42
   bloquea el cierre si alguno aparece.
10. **Streamdown trae estilos propios.** Se auditan sus selectores para que no reintroduzcan tipografía,
    fondos o radios ajenos al sistema visual.
11. **La preferencia de layout en localStorage puede corromperse o no estar disponible.** El decoder puro
    cae al valor aprobado y la interfaz funciona sin persistencia.
12. **No hay tests de componentes configurados como primera línea.** Los invariantes de interacción se
    cubren con lógica pura y QA manual. Solo se introduce un test DOM con happy-dom si detecta una
    regresión silenciosa que no cabe en función pura; no se monta otra infraestructura de testing.
13. **Un mensaje amigable puede ocultar demasiado.** Por eso la pantalla y el diagnóstico son dos
    salidas obligatorias de la misma frontera: el estudiante recibe una acción comprensible y el
    desarrollador conserva una causa técnica útil con contexto y secretos redactados. No se resuelve
    borrando toda la información.
14. **La cola de subida sigue orquestada en cliente.** Moverla a un diálogo puede desmontarla por
    accidente y cortar la actualización visual aunque las peticiones continúen. `UploadManager`
    permanece montado, y F5-07 a F5-09 obligan a cerrar y reabrir durante validación y preparación.

## Orden de arranque cuando corresponda

Con el commit final de fase 4 como base, invocar
`ejecutar-fase notes/plans/fase5-el-escritorio-de-estudio.md`. El ejecutor completa P0 antes de abrir
P1 y repite la regla para P2 y P3. Cuando se agote el calendario, termina el nivel actual o revierte su
parte incompleta, ejecuta su cierre de checks y documentación y entrega el último corte verde. El
documento ya está en su ubicación definitiva; no hay que moverlo ni crear otra copia.

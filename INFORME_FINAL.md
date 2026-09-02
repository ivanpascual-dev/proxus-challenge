# Informe final

## Índice

1. [El problema que elegí](#1-el-problema-que-elegí)
2. [Cómo lo resolví](#2-cómo-lo-resolví)
   1. [Un tutor con contexto](#21-un-tutor-con-contexto-no-un-generador-de-artefactos)
   2. [Del PDF a un espacio de estudio estructurado](#22-del-pdf-a-un-espacio-de-estudio-estructurado)
   3. [Controles, Exámenes y perfil de estudio](#23-controles-exámenes-y-perfil-de-estudio)
   4. [Una interfaz pensada alrededor del flujo de estudio](#24-una-interfaz-pensada-alrededor-del-flujo-de-estudio)
   5. [Dependencias y componentes añadidos](#25-dependencias-y-componentes-añadidos)
   6. [Límites y control del uso](#26-límites-y-control-del-uso)
      1. [Materiales, conversaciones y frecuencia](#261-materiales-conversaciones-y-frecuencia)
      2. [Presupuesto del agente y del modelo](#262-presupuesto-del-agente-y-del-modelo)
      3. [Apuntes, pruebas e intentos](#263-apuntes-pruebas-e-intentos)
      4. [Indexación y contenido externo](#264-indexación-y-contenido-externo)
3. [Cómo probar la aplicación](#3-cómo-probar-la-aplicación)
   1. [Arrancar la aplicación](#31-arrancar-la-aplicación)
   2. [Lo primero que aparece es el chat](#32-lo-primero-que-aparece-es-el-chat)
   3. [Subir un material y verlo prepararse solo](#33-subir-un-material-y-verlo-prepararse-solo)
   4. [Hablar con Sym](#34-hablar-con-sym)
   5. [Abrir un material: el espacio de estudio](#35-abrir-un-material-el-espacio-de-estudio)
   6. [PDF](#36-pdf)
   7. [Mapa mental](#37-mapa-mental)
   8. [Apuntes](#38-apuntes)
   9. [Pruebas](#39-pruebas)
   10. [Progreso y siguiente paso](#310-progreso-y-siguiente-paso)
   11. [Sym ve lo que estás viendo](#311-sym-ve-lo-que-estás-viendo)
   12. [Qué queda fuera](#312-qué-queda-fuera)
4. [Checks ejecutados](#4-checks-ejecutados)
   1. [Integración continua](#41-integración-continua)
   2. [Tests de la lógica crítica](#42-tests-de-la-lógica-crítica)
   3. [Guardarraíles y comportamiento del tutor](#43-guardarraíles-y-comportamiento-del-tutor)
   4. [Evaluaciones de los flujos de AI](#44-evaluaciones-de-los-flujos-de-ai)
   5. [Medición de tokens](#45-medición-de-tokens)
   6. [Resultado de la última pasada](#46-resultado-de-la-última-pasada)
5. [Fallos conocidos](#5-fallos-conocidos)
6. [Cómo trabajé](#6-cómo-trabajé)
7. [Qué haría después con más tiempo](#7-qué-haría-después-con-más-tiempo)

## 1. El problema que elegí

Cuando empecé a probar el proyecto vi que la base del MVP era bastante buena y que tenía potencial
para convertirse en una herramienta útil. Sin embargo, tal y como estaba planteado, su uso era muy
limitado. Los materiales, los artefactos y el tutor existían, pero apenas estaban conectados entre sí.
El tutor podía responder a una petición concreta, pero no tenía una visión suficiente de todo lo que
el alumno había ido haciendo ni podía aprovechar ese historial para ayudarle mejor.

Para mí, ese era el principal problema: no había continuidad en el estudio. Subir unos apuntes,
generar una prueba y hablar con el tutor eran acciones separadas. Después de responder una prueba, el
resultado terminaba prácticamente en la nota y no servía para que el sistema entendiese mejor qué
temas costaban más, dónde se habían necesitado pistas o qué contenido consideraba importante el
propio alumno. En esas condiciones, la ayuda para preparar un examen podía terminar siendo demasiado
genérica.

Por eso decidí no centrarme en añadir una única funcionalidad aislada, sino en rediseñar la forma de
trabajar con el tutor y con los materiales. El objetivo ha sido convertir la base existente en una
experiencia de estudio más completa, en la que los apuntes, las pruebas, los intentos y las
conversaciones formen parte del mismo proceso y aporten contexto para la siguiente acción.

## 2. Cómo lo resolví

La solución se apoya en tres partes que están relacionadas: dar más contexto al tutor, convertir los
materiales en un espacio de trabajo y ampliar la forma de practicar y evaluar el progreso. También
rediseñé el frontend para que estos flujos no dependieran de saber qué pedirle al tutor ni de escribir
comandos o peticiones muy concretas.

### 2.1. Un tutor con contexto, no un generador de artefactos

Una de las decisiones principales fue separar mejor las responsabilidades. El tutor ya no genera
apuntes, Controles ni Exámenes desde el chat. Estos procesos se inician desde sus apartados de la
interfaz, de una forma más directa y predecible. De esta manera, una acción que tiene una entrada y un
resultado bien definidos no depende de que el alumno sepa cómo pedírsela al modelo.

A cambio, el tutor ha ganado contexto. Las conversaciones se guardan y puede consultar los
materiales, los apuntes, las pruebas realizadas, los intentos y el perfil de estudio. También conoce
qué material o artefacto está abierto en la interfaz, pero ese contexto se muestra antes de enviar el
mensaje y el alumno puede retirarlo. Con esta información puede mantener conversaciones con más
continuidad, explicar un concepto utilizando el material real y recomendar qué repasar a partir de
los fallos y de la actividad anterior.

El tutor sí puede proponer cambios sobre los apuntes, por ejemplo añadir, reescribir o eliminar un
bloque, pero nunca los aplica por su cuenta. La propuesta se muestra en la interfaz y es el alumno
quien decide si la acepta o la descarta. Así se mantiene la utilidad de trabajar de forma conversacional
sin perder el control sobre el contenido.

Este cambio también supuso reorganizar las skills del agente. Al principio solo había dos. La primera,
`use-uploaded-materials`, permitía listar materiales y renderizar páginas como imágenes. La segunda,
`create-study-artifacts`, concentraba demasiadas responsabilidades: el tutor podía crear apuntes,
quizzes y tests, enviar respuestas y corregir intentos. Era una capacidad muy amplia para operaciones
que afectan directamente al progreso del alumno.

La skill `create-study-artifacts` se eliminó y las capacidades actuales se dividieron en cinco áreas
más concretas:

| Skill actual             | Para qué se utiliza                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `use-uploaded-materials` | Lee primero el texto ya indexado y solo abre la imagen de una página cuando el texto no es suficiente. |
| `use-study-notes`        | Consulta la estructura de los apuntes y carga únicamente los bloques necesarios.                       |
| `read-assessments`       | Lee los Controles y Exámenes guardados y explica su contenido.                                         |
| `review-progress`        | Consulta los intentos y el perfil para explicar qué conviene repasar y por qué.                        |
| `propose-note-changes`   | Prepara propuestas de cambio sobre un apunte para que el alumno las revise.                            |

Por tanto, el tutor ahora puede consultar mucha más información que antes, pero tiene menos capacidad
para modificarla. No puede crear apuntes o pruebas, responderlas, corregir intentos, escribir el perfil
ni aceptar sus propias propuestas. Estas acciones se realizan mediante servicios deterministas desde
la interfaz. Era especialmente importante retirar la creación y corrección de intentos: si el propio
modelo pudiera fabricarlos, también podría alterar indirectamente el perfil que después utiliza para
recomendar qué estudiar.

También se rehízo el mensaje de sistema. El tutor debe obtener los datos reales mediante comandos antes
de responder, no puede inventar citas, trata el contenido de materiales y páginas web como datos y no
como instrucciones, y conserva el vocabulario del documento sin traducirlo. Las instrucciones internas
están en inglés, pero todo el contenido dirigido al alumno se genera en español. Las skills se cargan
solo cuando son necesarias y, si una ya se utilizó en la conversación, no se vuelve a enviar completa.
Esto reduce contexto repetido y hace más clara la elección de herramientas.

### 2.2. Del PDF a un espacio de estudio estructurado

También rediseñé por completo el tratamiento de los materiales. Los PDF se suben desde la propia
interfaz y, después de validarlos, el sistema los analiza página a página, los indexa por temas y crea
automáticamente los apuntes. El índice se organiza en un mapa de temas y subtemas que sirve como base
para navegar por el documento y para generar el resto del contenido de estudio.

Para reducir el coste de este proceso no todas las páginas se envían al modelo como una imagen. Primero
se intenta extraer su contenido con `pdftotext` y se cuentan los caracteres útiles, sin tener en cuenta
los espacios. Si la página contiene al menos 600 caracteres, se considera que tiene suficiente texto
y se indexa directamente. Cuando no alcanza ese umbral, como puede ocurrir en una diapositiva, una
página escaneada o una página principalmente visual, se renderiza y Gemini se encarga de transcribirla.
La decisión se toma por página y no por PDF completo, porque un mismo documento puede mezclar páginas
de los dos tipos.

El umbral de 600 caracteres no se eligió de forma arbitraria, sino después de medir la densidad de las
páginas del corpus utilizado durante el desarrollo. Además, las imágenes se renderizan ajustando su
lado corto a 1.152 píxeles en lugar de utilizar una resolución fija, para no enviar más tamaño del que
el modelo puede aprovechar. De esta forma, un PDF con texto embebido se procesa prácticamente sin
consumo del modelo y solo se pagan las páginas en las que la extracción normal no es suficiente.

La procedencia queda guardada en el índice como texto extraído o como transcripción del modelo. En el
visor, las páginas transcritas se identifican con una marca ámbar y las que no se pudieron procesar se
muestran con un aviso rojo. Esto permite saber qué camino se utilizó y evita presentar una
transcripción automática como si fuese el contenido original del PDF.

No todas las páginas acaban dentro de un tema, y eso es correcto: una portada, un separador, una
bibliografía o una página de cierre no son una unidad de estudio, así que el índice las deja sin tema
en lugar de inventarle uno. Un material puede llegar a no tener ningún tema; en ese caso la generación
de apuntes falla en voz alta antes que guardar un apunte de relleno.

Los apuntes dejan de ser un único texto generado y pasan a estar divididos en bloques, uno por cada
tema del índice y en su mismo orden. Esto permite estudiar el contenido por partes, editar únicamente el
bloque necesario, reordenarlo, marcarlo como importante o añadir contenido propio. También se puede
incorporar una URL externa: el sistema obtiene el contenido de la página, conserva el fragmento de
origen y prepara un nuevo bloque resumido que se puede revisar antes de integrarlo en los apuntes.

La URL no se entrega directamente al modelo ni se descarga sin comprobarla. Solo se permite HTTPS y,
antes de hacer la petición, el servidor resuelve el dominio y rechaza direcciones privadas, locales o
no enrutables, tanto IPv4 como IPv6 y sus variantes embebidas. Tampoco sigue redirecciones, porque cada
salto obligaría a repetir la validación del destino. La respuesta debe ser `text/html` o `text/plain`,
tiene un máximo de 2 MB y un tiempo límite de cinco segundos. Después se eliminan scripts, estilos y
etiquetas antes de preparar el borrador.

Estas comprobaciones reducen el riesgo de utilizar la funcionalidad para acceder a la red interna,
leer ficheros locales o descargar una respuesta sin límite. El fragmento extraído se conserva sin que
el modelo lo modifique y el resumen se presenta como borrador, de forma que el alumno puede revisar la
fuente antes de incorporarla a sus apuntes.

Cada bloque generado desde un material mantiene una cita a las páginas de las que procede. Desde la
interfaz se puede abrir la página real del PDF y comprobar la fuente, algo que me parecía importante
porque el texto indexado ayuda a trabajar con el contenido, pero la fuente de verdad sigue siendo el
documento original.

### 2.3. Controles, Exámenes y perfil de estudio

La parte de pruebas también se amplió. Los Controles son ejercicios cortos de entre cuatro y ocho
preguntas centrados en un tema concreto. Están pensados para practicar y permiten utilizar pistas,
consultar las páginas relacionadas y pedir ayuda al tutor. Combinan preguntas de opción única y de
respuesta corta, en una proporción de 70 y 30.

El alumno elige cuántas preguntas quiere; el reparto por tipo lo pone el código y no el modelo, de
manera que la forma de la prueba no cambia según el tamaño que se pida. En un Examen ese reparto es de
45 % de opción única, 25 % de respuesta múltiple, 10 % de verdadero o falso y 20 % de respuesta corta.
Poder elegir también los tipos es una de las mejoras que dejo apuntadas en [`FUTURE.md`](./FUTURE.md).

Los Exámenes abarcan el material completo y pueden tener entre diez y treinta preguntas. Se pueden
generar como Examen de prueba, manteniendo las ayudas del modo práctica, o como Examen real. En este
último caso se muestra una pantalla dedicada, se ocultan las pistas, las citas, el material y el chat,
y se aplica un tiempo límite calculado según las preguntas. El intento se conserva si se cierra o se
pierde la conexión, y el tiempo solo avanza mientras el alumno está dentro del examen.

Las respuestas cortas se corrigen con un juez basado en un modelo de lenguaje, ya que una respuesta
correcta puede estar expresada de muchas formas distintas. Aun así, el modelo no decide directamente
la nota: evalúa los criterios de una rúbrica y es el código el que calcula el resultado. Si el juez no
puede evaluar una respuesta con suficiente seguridad, se muestra como no evaluada en lugar de
convertir el fallo en una nota aparentemente válida.

Todas las preguntas guardan una referencia verificable al material, las páginas y el tema del que
proceden. Al corregir un intento, el sistema actualiza de forma determinista un perfil de estudio por
temas. Este perfil mantiene por separado los fallos observados, las pistas utilizadas y los bloques
marcados como importantes. No se mezclan en una puntuación artificial, pero sí permiten generar
repasos y que el tutor explique por qué recomienda volver a un tema concreto.

### 2.4. Una interfaz pensada alrededor del flujo de estudio

El frontend se reorganizó para que el recorrido completo resulte más claro. Los materiales son el
punto de entrada y, dentro de cada uno, se puede pasar por el PDF, el mapa de temas, los apuntes y las
pruebas sin perder el chat con el tutor. La subida muestra el progreso de cada fichero durante la
validación, la indexación y la generación de apuntes, y los errores se presentan en la parte de la
interfaz a la que afectan con una explicación útil para poder continuar.

Durante este rediseño también quise dar una identidad propia al producto. La aplicación pasó a
llamarse **Symma** y el agente **Sym**, acompañado siempre por la descripción “Tutor académico”. Esta
separación ayuda a entender que Sym es una parte del espacio de estudio y no el producto completo, y
permite mantener la misma identidad tanto en la interfaz como en las respuestas del propio agente.

Para la dirección visual tomé como referencia la web de Proxus. La tipografía Montserrat y parte de la
paleta morada están, en cierto modo, “prestadas” como un pequeño homenaje y para conservar el contexto
del challenge. No se copiaron como estilos sueltos: se adaptaron a las necesidades de Symma y se
organizaron como tokens semánticos para fondos, superficies, texto, bordes, estados y marca. Esto hizo
posible utilizarlos de forma consistente en los temas claro y oscuro y revisar el contraste sin tener
colores distintos repartidos por los componentes.

El modo de Examen real es la excepción: sustituye temporalmente todo el espacio de trabajo para evitar
que queden accesibles el tutor o los materiales. Al terminar o cancelar el intento se recupera el
escritorio de estudio normal.

La última parte de este rediseño fue el acabado, y es donde se nota la diferencia entre una aplicación
que funciona y una que se puede usar. Las tres generaciones (indexar, apuntes y pruebas) enseñaban una
lista de frases con aspecto de consola, y ahora cuentan por dónde van en **una sola línea que se
sustituye**, siempre a partir de un evento real del servidor: nunca rota por tiempo ni inventa un
porcentaje, porque una pantalla que avanza mientras el servidor está parado es exactamente la clase de
valor neutro que quería evitar. Al terminar de generar una prueba, la aplicación abre su resolutor,
pero solo cuando el destino es inequívoco: un Examen real lleva a su pantalla previa sin crear un
intento ni arrancar el reloj. El separador entre el material y Sym ganó una agarradera visible que
distingue arrastrar de pulsar, de modo que se puede plegar el chat a un carril y leer a solas sin
perder el borrador. Y Sym pasó a saber en qué superficie, página, apunte, bloque o prueba está el
alumno, con esa información visible y retirable, además de enseñar debajo de cada respuesta las
fuentes que consultó de verdad, tomadas del propio bucle de herramientas y no extraídas del texto con
una expresión regular.

Antes de ese acabado hubo un corte de correcciones de doce incidencias que salieron de usar la
aplicación en serio: datos que quedaban huérfanos al borrar un material, la preparación automática de
un lote de cinco PDF que se bloqueaba a sí misma contra su propio límite de concurrencia, apuntes con
bloques de relleno para portadas y cierres, pruebas que fallaban enteras por un error de formato, un
historial de conversaciones sin orden y un chat que gastaba el límite de sesiones creando
conversaciones vacías. No añadían capacidades nuevas, así que es fácil no contarlas, pero son las que
hacen que el recorrido de la sección 3 se pueda hacer entero sin tropezar.

### 2.5. Dependencias y componentes añadidos

El challenge pedía evitar nuevos frameworks o dependencias salvo que hubiera una razón clara para
introducirlos, así que intenté mantener ese criterio durante todo el desarrollo. La principal
incorporación al frontend fue TipTap para el editor de los apuntes. En este caso sí me parecía
justificado: construir desde cero un editor enriquecido con selección, enlaces, listas, tablas, una
barra flotante y un menú de comandos habría ocupado una parte importante del challenge y habría sido
muy fácil introducir errores difíciles de detectar.

No utilicé la plantilla completa de TipTap ni ningún servicio en la nube. Integré únicamente las
extensiones necesarias y limité los formatos a aquellos que pueden volver a guardarse como Markdown
limpio. Esto permite que el editor, la visualización de los apuntes, las reescrituras y las propuestas
del tutor sigan trabajando sobre una única representación. También añadí `happy-dom` únicamente como
dependencia de desarrollo para poder montar el editor en los tests y comprobar que el recorrido
Markdown → editor → Markdown no pierde información ni introduce HTML.

El otro componente importante fue un `ErrorBoundary`, pero en este caso no hizo falta incorporar una
librería. Surgió después de encontrar un fallo en una respuesta corta que dejaba toda la página en
blanco. El componente utiliza la propia API de React y separa las principales zonas de la aplicación:
si falla el panel de un material, el chat o la barra lateral no tienen por qué desaparecer también. El
alumno recibe una explicación y puede reintentar o recargar, mientras que el detalle técnico se
conserva en la consola para poder diagnosticarlo.

Para el resto del rediseño tampoco añadí una librería de componentes, iconos, layout, paneles
divisibles o navegación por el mapa. React, Tailwind, SVG y los eventos nativos del navegador eran
suficientes y evitaban aumentar la complejidad del proyecto sin una mejora equivalente.

El resultado se puede comprobar comparando los `package.json` con los de la plantilla: el servidor,
`packages/shared` y `packages/ai-google` no incorporan **ninguna** dependencia nueva, y en la web solo
entran TipTap y `happy-dom`. El stack sigue siendo el del challenge.

### 2.6. Límites y control del uso

Por último, añadí límites explícitos a todas las operaciones que pueden crecer o generar coste. Todos
los valores viven en `packages/shared/src/limits.ts`, de manera que el servidor y la interfaz utilizan
la misma referencia. El servidor es quien los aplica realmente; la interfaz los muestra antes para que
la persona sepa qué puede hacer.

Cuando se supera uno de estos límites, la aplicación lo comunica y rechaza la operación en lugar de
recortar datos en silencio. Además de evitar un consumo excesivo de tokens o un uso indebido de la
aplicación, esto impide que el tutor responda como si hubiera analizado una información que en realidad
se ha quedado fuera. Los presupuestos del agente se controlan por turno completo y no solo por cada
llamada individual, ya que de lo contrario el modelo podría repetir la operación en cada paso y
multiplicar el techo.

#### 2.6.1. Materiales, conversaciones y frecuencia

| Área                   | Límite actual                                         | Motivo                                                                                                       |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Materiales almacenados | 5                                                     | Acota el espacio local y el número de artefactos relacionados.                                               |
| Subida                 | 5 PDF por lote, 10 MB y 30 páginas por fichero, 10 subidas al día | El tamaño es un fusible barato de entrada; el techo de páginas es el que acota el coste real, porque cada página bajo el umbral de densidad cuesta una llamada de visión. |
| Mensajes               | 2.000 caracteres; 20 cada 10 minutos y 200 al día     | Limita tanto una petición individual como el uso sostenido.                                                  |
| Conversaciones         | 50 conversaciones; título de hasta 80 caracteres      | Evita que el almacenamiento y los listados crezcan sin control.                                              |
| Historial del chat     | 80.000 tokens, con aviso al 75 %                      | Utiliza el consumo real informado por el modelo y recomienda abrir una conversación nueva antes de bloquear. |
| Contexto visible       | 3 referencias por mensaje                             | Corresponde al máximo que puede mostrar la interfaz: material, artefacto y bloque activo.                    |
| Seguimiento            | 3 preguntas de hasta 200 caracteres                   | Mantiene útiles y acotadas las sugerencias que aparecen tras cada respuesta.                                 |
| Actividad del agente   | 4.000 caracteres por resultado mostrado               | Techo visual, no de lo persistido: sin él, un resultado con páginas en base64 volcaría megabytes al DOM.     |
| Concurrencia           | 3 peticiones simultáneas por cliente                  | Evita que varias generaciones costosas se acumulen a la vez.                                                 |

También se reservó un techo de 12.000 caracteres para texto añadido como contexto manual. Actualmente
no se consume porque esa forma de adjuntar texto quedó fuera del alcance final; se documenta como no
aplicable en lugar de fingir que existe un flujo que lo utiliza.

#### 2.6.2. Presupuesto del agente y del modelo

| Área                | Límite actual                                                                        | Motivo                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Pasos del agente    | 12 por turno                                                                         | Permite consultar varias fuentes sin dejar abierto un bucle indefinido.                       |
| Páginas como imagen | 20 páginas y 12 MB en base64 por turno                                               | Las páginas no pesan lo mismo, por lo que se limitan tanto la cantidad como los bytes reales. |
| Lectura del índice  | 20 páginas y 60.000 caracteres por turno                                             | Evita sustituir el coste de las imágenes por un contexto de texto ilimitado.                  |
| Llamada al modelo   | 60 segundos                                                                          | Un proveedor que no responde no mantiene bloqueada la operación indefinidamente.              |
| Tokens de salida    | 4.096 para tutor, indexación, apuntes y juez; 8.192 para Control; 16.384 para Examen | Cada flujo tiene un tamaño esperado distinto y se dimensionó por separado.                    |

La temperatura también se fija por código: 0,2 para las respuestas de texto y 0 para los caminos JSON,
donde interesa que una misma entrada se decodifique de forma estable. El nivel de razonamiento se
decide por flujo a partir de las evaluaciones, como se explica en el apartado de checks.

#### 2.6.3. Apuntes, pruebas e intentos

| Área                       | Límite actual                                                              | Motivo                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generación de artefactos   | 5 cada 10 minutos y 40 al día                                              | Acota las operaciones que llaman al modelo. La primera indexación y generación de apuntes tras una subida tienen una gracia de 20 minutos porque la subida ya se ha contabilizado. La gracia se concede una sola vez y no se renueva: tiene que cubrir subir cinco PDF, indexarlos en paralelo y arrancar el último apunte. |
| Apunte                     | 200 bloques, título de 200 caracteres y 5.000 caracteres por bloque        | Permite apuntes amplios, pero evita documentos o guardados sin un tamaño conocido.                                                                                                 |
| Fuentes y propuestas       | Fragmento de 4.000 caracteres y 20 propuestas pendientes por apunte        | El fragmento sirve para comprobar la fuente sin duplicarla completa y las propuestas no se acumulan sin revisión.                                                                  |
| Control                    | Entre 4 y 8 preguntas, 6 por defecto, y hasta 2 Controles por tema         | Mantiene el formato corto y evita generar variaciones ilimitadas del mismo alcance.                                                                                                |
| Examen                     | Entre 10 y 30 preguntas, 20 por defecto, y hasta 2 por material y por modo | Se cuentan por separado los Exámenes de prueba y los reales.                                                                                                                       |
| Preguntas por artefacto    | 50 como fusible general                                                    | Protege el contrato aunque actualmente los rangos de producto sean menores.                                                                                                        |
| Intentos                   | 3 de práctica y 3 de examen por prueba                                     | Evita intentos ilimitados y conserva un historial manejable.                                                                                                                       |
| Generación incompleta      | 2 reintentos por tema                                                      | Se vuelve a pedir únicamente lo que falta; después se falla en voz alta sin guardar una prueba incompleta.                                                                         |
| Pistas y respuesta abierta | 300 caracteres por pista y 1.500 por respuesta                             | Limita el contenido que se muestra o se envía al juez.                                                                                                                             |
| Juez                       | 5 criterios por rúbrica y 8 llamadas por intento                           | El modelo evalúa criterios concretos y queda acotado incluso si cambia el reparto de preguntas.                                                                                    |

El tiempo del Examen real se calcula según el tipo de cada pregunta: 60 segundos para opción única, 90
para respuesta múltiple, 30 para verdadero o falso y 120 para respuesta corta, más cinco minutos de
revisión. El navegador envía un latido cada 15 segundos; un hueco superior a 45 segundos se registra
como interrupción y no cuenta como tiempo conectado. También hay 15 segundos de margen al entregar
para absorber la latencia de red y pequeñas diferencias de reloj.

#### 2.6.4. Indexación y contenido externo

| Área               | Límite actual                                    | Motivo                                                                                     |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Índice             | 40 temas por material y hasta 3 temas por página | Mantiene útil el mapa mental y evita una clasificación excesivamente fragmentada.          |
| Respaldo de un tema | 60 caracteres no blancos como mínimo            | Un tema sin ese respaldo se descarta: es la red determinista contra portadas, separadores y cierres que el modelo etiqueta como tema. |
| Texto indexado     | 8.000 caracteres por página                      | Impide que una página anómala domine todo el contexto.                                     |
| Indexación         | 4 páginas en paralelo                            | Reduce el tiempo de proceso sin lanzar llamadas al proveedor sin control.                  |
| URL externa        | 2 MB y 5 segundos                                | Evita descargas grandes o conexiones que quedan abiertas.                                  |
| PDF con poco texto | Menos de 600 caracteres útiles                   | Activa la transcripción por imagen solo cuando `pdftotext` no aporta suficiente contenido. |
| Imagen de página   | 1.152 píxeles en el lado corto                   | Mantiene detalle suficiente sin enviar resolución que el modelo no va a aprovechar.        |

Estos números son una base razonable para el MVP, no valores definitivos de producto. Algunos salen de
mediciones sobre los PDF y conversaciones utilizados durante el desarrollo; otros responden a la
escala local del challenge y a los límites del proveedor. Con uso real revisaría especialmente la tasa
de rechazos, el tamaño y duración de las conversaciones, la latencia, el coste por flujo y cuántos
intentos necesita un alumno. Al estar centralizados, se pueden ajustar sin que el frontend y el backend
terminen aplicando cifras diferentes.

## 3. Cómo probar la aplicación

Prefiero contar esto como un recorrido y no como una lista de comprobaciones sueltas. Symma se
entiende usándola en orden, porque cada paso deja preparado el siguiente: se sube un material, de ahí
sale el mapa y los apuntes, de los apuntes salen las pruebas, y de las pruebas sale el progreso que
Sym utiliza después. Contarlo así enseña a la vez qué se puede hacer y qué debería pasar en cada
punto, que es justo lo que hay que mirar para revisarla.

### 3.1. Arrancar la aplicación

Hacen falta Node, pnpm, Poppler (`pdfinfo`, `pdftoppm` y `pdftotext` en el `PATH`) y una API key de
Google Gemini. El servidor falla al arrancar si falta alguno de ellos, y lo hace a propósito: prefiero
un error claro al principio antes que un fallo raro a mitad de una indexación.

**Merece la pena comprobar que esa clave no está en el plan gratuito de Gemini.** El plan gratuito
limita a 15 peticiones por minuto, y ese techo no lo pone el código: con él, indexar un material con
muchas páginas de baja densidad se convierte en varios minutos de espera con reintentos, y da la
sensación de que la aplicación va lenta cuando en realidad está esperando al proveedor. Con una clave
de pago, ese ritmo desaparece.

```bash
pnpm install
cp .env.example .env      # y editar GOOGLE_GENERATIVE_AI_API_KEY
pnpm run seed:demo        # materiales de prueba
pnpm run dev              # web en http://localhost:5173, API en http://localhost:3000
```

`pnpm run seed:demo` copia los PDF de `packages/server/fixtures/materials/` al almacenamiento local
del servidor, de forma que se puede recorrer la aplicación entera sin subir material propio. El de
demostración es `enjambres-de-inspeccion.pdf`: seis páginas de un manual inventado de principio a fin,
sin derechos de terceros, con contenido suficiente para que salgan nueve temas en el mapa y para
generar apuntes, Controles y Exámenes. Los otros dos son fixtures de test y no son material de
estudio: `densidad.pdf` calibra el umbral de densidad de texto y `inyeccion.pdf` es munición de la
batería de guardarraíles. Si molestan, se borran de `packages/server/.data/materials/pdfs/`. También
se puede empezar con la aplicación vacía y subir un PDF propio desde la interfaz, que es el recorrido
que describo a partir de aquí.

### 3.2. Lo primero que aparece es el chat

Al entrar solo está Sym ocupando toda la pantalla y, a la izquierda, la barra lateral con los
materiales que haya. Si todavía no hay ninguno, Sym lo dice en vez de fingir que puede ayudar igual:
invita a subir un material para poder acompañar el estudio de verdad. Aun así se puede hablar con él
desde el primer momento, y hay tres sugerencias para empezar sin tener que pensar qué escribir.

Esta pantalla también es el sitio donde comprobar el tema claro, oscuro y del sistema: se cambia sin
recargar y la preferencia sobrevive a un refresco.

### 3.3. Subir un material y verlo prepararse solo

Se pueden subir varios PDF a la vez. Todos se validan antes de escribir nada en disco, así que si se
mezcla un fichero que no vale, se puede retirar el rechazado y seguir con los buenos. Merece la pena
probar el caso feo a propósito: seleccionar un PDF válido junto con un fichero que no lo sea.

Lo importante es lo que ocurre después, porque no hay que pedir nada. Cada material sube, se indexa y
genera sus apuntes de forma automática, encadenado, y todo eso se cuenta en **una sola línea de
progreso que se sustituye** (páginas, luego temas, luego apuntes), nunca una lista de frases que
crece ni un porcentaje inventado: si el servidor está parado, la línea está parada. Al terminar, si se
subió un único PDF y no había ningún material abierto a mano, la aplicación lo abre en el mapa, que es
el único destino que no admite duda. Con dos o más ficheros no navega sola a ninguna parte.

### 3.4. Hablar con Sym

Con material ya preparado, Sym puede trabajar. Se le pregunta con normalidad, sin comandos ni fórmulas:
él consulta los materiales que hagan falta antes de afirmar nada y responde citando de dónde lo ha
sacado, con las **fuentes consultadas** debajo de la respuesta.

Cada respuesta termina con tres preguntas para seguir tirando del hilo, que se pueden pulsar como si
las hubieras escrito tú, y también se puede ignorar lo que propone y preguntar otra cosa. Hay
conversaciones separadas, con su historial: se crea una nueva, se cambia de una a otra y se recarga la
página, y los turnos vuelven desde el servidor, porque la conversación no vive en el navegador.

Merece la pena abrir la actividad del agente en un turno cualquiera, por ejemplo pidiéndole que liste
los materiales. Cerrada, cuenta en una frase qué hizo; abierta, enseña los pasos en orden. Lo que no
aparece por ninguna parte es la cocina: ni claves, ni imágenes en base64, ni el mensaje de sistema, ni
el resultado crudo de una herramienta.

### 3.5. Abrir un material: el espacio de estudio

Al abrir un material la pantalla se parte en dos: el material a la izquierda y Sym a la derecha, con
un separador que se arrastra para dar más sitio a lo que estés haciendo. Ninguno de los dos paneles
baja de 420 px, así que no se puede dejar uno inservible. Pulsando la agarradera sin arrastrar, Sym se
pliega a un carril estrecho sin desmontarse: el borrador que estuvieras escribiendo, el contexto
adjunto y una respuesta a medio llegar siguen ahí al desplegarlo. La barra lateral se pliega igual, y
la cabecera tiene un control que lo pliega todo de golpe. Es lo que convierte la pantalla en un sitio
para leer a solas cuando toca estudiar de verdad.

El material tiene cuatro pestañas: **PDF**, **Mapa mental**, **Apuntes** y **Pruebas**.

### 3.6. PDF

Es el material tal cual se subió, que es la única fuente que no ha tocado ningún modelo. Tiene
miniaturas laterales que se cargan a medida que hacen falta y no de golpe al abrir, página activa
sincronizada, salto directo, ajuste de ancho y zoom. Desde aquí también se le puede pasar a Sym la
página concreta que estás mirando, que aparecerá como una etiqueta que puedes quitar antes de enviar.

Las páginas llevan su procedencia a la vista: una marca ámbar en las que tuvo que transcribir el
modelo porque el PDF no traía texto suficiente, y una banda roja en las que fallaron. No se enseña el
texto indexado como si fuera verdad; se enseña la página.

### 3.7. Mapa mental

Al indexar, el material queda repartido en temas, y el mapa los pinta en dos niveles. Sirve para ver
de un vistazo de qué va el documento y cómo se organiza, que en un PDF corrido no se aprecia. Se
arrastra el fondo, se amplía bajo el cursor, se centra, y con el foco dentro funcionan Ctrl `+`,
Ctrl `-` y Ctrl `0` sobre el mapa y no sobre el navegador. `Colores por grupo` tiñe cada rama de un
color distinto, que ayuda cuando el material tiene muchos temas y hay que distinguir bloques de un
golpe de vista.

Pulsando un tema, con ratón o con teclado, se abre su menú: `Ir a apuntes`, para saltar directamente
al bloque que le corresponde, y `Crear Control`, para generar una prueba solo de ese tema.

También es donde se nota que el índice no rellena huecos: una portada o una página de cierre no son un
tema, así que no aparecen como nodo.

### 3.8. Apuntes

Los apuntes se generan solos junto con la indexación, con un bloque por cada tema del índice y en el
mismo orden. La idea era que se pareciesen a algo entre un Notion y un documento de Google, no a un
muro de texto: se leen, se editan en el sitio y se estudian sin salir de aquí.

Cada bloque se puede trabajar de varias formas:

- **Editarlo tú.** Se escribe dentro como en cualquier editor: seleccionar texto saca una barra
  flotante y escribir `/` al principio de una línea abre el menú de formatos. Se guarda siempre como
  Markdown limpio.
- **Pedirle a Sym que lo cambie de nivel.** `Más claro` o `Más a fondo` devuelven una versión nueva
  al lado de la actual y no se guarda nada hasta pulsar `Reemplazar`.
- **Comprobar de dónde sale.** El bloque enseña sus páginas; al pulsarlas se abre el PDF de ese
  material en la primera página citada. Esa es la comprobación que quería que existiera siempre.
- **Escribir bloques propios.** Lo que dijo el profesor y no está en el PDF, un ejemplo tuyo, lo que
  sea. Quedan marcados como tuyos y no se mezclan con los que redactó el modelo.
- **Traer una página web.** Se añade un bloque desde una URL y llega con el fragmento real que se
  descargó, para poder contrastarlo, además del borrador redactado. Conviene probar los casos malos
  (`https://127.0.0.1/x` o un `http://`) y ver que los rechaza nombrando el motivo, sin traer nada.
- **Pasar al apunte lo hablado en el chat.** Si le pides a Sym que añada algo de la conversación,
  aparece en Apuntes como **propuesta pendiente**, con su motivo y su antes y después, sin haber
  tocado ningún bloque. La aceptas tú. Si después le pides que la aplique él, no puede, y lo explica.
- **Marcar un bloque como importante.** Es una señal aparte, ni nota ni acierto, y es la que hace que
  ese contenido pese en las pruebas de repaso y en la recomendación del siguiente paso.

### 3.9. Pruebas

Hay dos formatos, y la diferencia entre ellos es a propósito.

Un **Control** es corto y va de un tema concreto, el que hayas elegido en el mapa. Es para practicar:
tienes las pistas disponibles, el material al lado y a Sym para preguntarle.

Un **Examen** abarca el material completo y tiene dos modos. El **de prueba** sigue siendo a libro
abierto, con pistas, apuntes, PDF y chat, para medirte sin cortarte las alas. El **real** es lo
contrario: al empezar desaparecen la barra lateral, el material y Sym, queda solo el examen con su
reloj, y el servidor cierra de verdad las rutas de estudio mientras dure, no solo la interfaz. Antes
de empezar hay una pantalla previa que avisa de todo esto, y pulsar `Ahora no` no arranca el reloj ni
consume un intento. Si se recarga o se abandona a mitad, se puede retomar con el tiempo restante o
cancelarlo, y la interrupción queda registrada en el historial.

Al corregir se ve la nota, qué está bien, qué está mal y de qué página salía cada pregunta. Distingue
un fallo de una pregunta en blanco y de una que no se ha podido evaluar, que nunca se convierte en un
cero silencioso. En las respuestas escritas, si el juez interpreta mal lo que quisiste decir, `Esto sí
lo dije` retira esa corrección de tu perfil sin retocar por detrás la nota que ya se te enseñó. Y cada
prueba conserva su historial de intentos.

### 3.10. Progreso y siguiente paso

`Ver progreso` abre el panel con todo lo que has hecho, repartido por temas: aciertos, fallos,
respuestas en blanco, respuestas sin evaluar, pistas abiertas y contenido que marcaste como
importante. Están separadas a propósito, sin ningún porcentaje de dominio que las funda en un número
que después no se pueda explicar.

Al lado está `Siguiente paso`, que propone qué hacer ahora: repasar un tema que llevas peor, seguir
con los apuntes o practicar. Lo calcula el código y no el modelo, y siempre dice cuál es la señal
concreta por la que te lo recomienda, no una frase genérica. Desde ahí se puede generar una prueba
`De repaso`, en la que cada pregunta indica por qué entró: un fallo, una pista o una marca tuya.

### 3.11. Sym ve lo que estás viendo

Es lo que ata todo lo anterior. Sym sabe en qué material estás, en qué pestaña, en qué página, qué
apunte o qué bloque tienes abierto y qué prueba estás resolviendo o revisando. Eso se ve siempre como
etiquetas encima del cuadro de escribir y se puede quitar antes de enviar. Si estás leyendo una página
del PDF, la está leyendo contigo; si no quieres que lo haga, la retiras y no viaja.

Preguntarle "¿dónde estoy?" es la forma más rápida de comprobarlo: nombra la superficie y, con una
prueba abierta, la prueba exacta y si la estás resolviendo o mirando su historial.

### 3.12. Qué queda fuera

La entrega cierra la fase 5 completa: los niveles P0, P1 y P2, el corte de correcciones `C5-01` a
`C5-15` y el tramo P3 entero, construido en cuatro cortes (progreso vivo y navegación al terminar,
separador y plegado de Sym, contexto de pantalla estructurado y fuentes consultadas). Dos cosas quedan
**fuera del alcance entregado** y no las presento como terminadas: el responsive específico de tablet
y móvil, descartado el 2026-09-02 porque el reto se entrega para escritorio, y las acciones
`Abrir páginas` y `Preguntar a Sym` desde un tema del mapa, que exigen decidir antes qué referencia
describe un tema. Lo que sigue pendiente se conserva en [`FUTURE.md`](./FUTURE.md) para continuarlo
después del challenge.

## 4. Checks ejecutados

La validación no se dejó en una única comprobación final, sino que se fue incorporando durante el
desarrollo. Separé los checks deterministas, que pueden ejecutarse sin conectarse a ningún proveedor,
de las evaluaciones que llaman al modelo real y cuyos resultados pueden variar entre ejecuciones.

### 4.1. Integración continua

Añadí un workflow de GitHub Actions que se ejecuta en cada PR. Instala las dependencias con el lockfile
congelado, instala Poppler de forma explícita y ejecuta:

```bash
pnpm run typecheck
pnpm --filter @proxus/web run build
pnpm test
```

Esto comprueba los tipos y el análisis estático de los cuatro paquetes, genera la versión de producción
del frontend y ejecuta la batería de tests. El workflow tiene permisos de solo lectura, un tiempo
máximo de ejecución y cancela la pasada anterior cuando se sube una revisión nueva de la misma PR.

No añadí ESLint ni Biome porque el análisis estático de Effect ya se integra en TypeScript mediante
`@effect/language-service`. Añadir otro linter habría duplicado parte de las comprobaciones y sumado
otra configuración sin aportar una cobertura distinta.

### 4.2. Tests de la lógica crítica

Los tests utilizan `node:test`, incluido en Node, en lugar de incorporar Vitest u otro framework. No
busqué cubrir líneas por cubrirlas, sino proteger las partes en las que un error podría producir un
resultado válido en apariencia. Entre otras cosas, se comprueban:

- los límites justo antes y justo después de cada techo;
- la clasificación, indexación y lectura de las páginas de un PDF;
- el anclaje de apuntes y preguntas a páginas reales;
- la generación completa de Controles y Exámenes y el reparto de preguntas;
- la corrección, las penalizaciones, el reloj y el bloqueo del Examen real;
- la actualización determinista del perfil y la separación de sus señales;
- las guardas al traer contenido desde una URL;
- la persistencia de materiales, artefactos, intentos y conversaciones;
- el recorrido del editor entre Markdown y TipTap sin pérdida de contenido.

La mayor parte de esta batería utiliza fixtures, repositorios en memoria y modelos simulados. De esta
forma puede ejecutarse en CI sin una clave de Gemini y sin depender de respuestas variables del
modelo.

### 4.3. Guardarraíles y comportamiento del tutor

También añadí un script de caja negra que prueba el tutor contra el endpoint real:

```bash
pnpm run dev
pnpm test:guardarrailes
STRICT=1 pnpm test:guardarrailes
```

Aquí se separan las barreras deterministas de código de los comportamientos que dependen del modelo.
Las primeras comprueban, por ejemplo, los límites de entrada y que el cliente no pueda fabricar el
historial ni los resultados de una herramienta. Las segundas prueban intentos de cambio de rol,
extracción del prompt, invenciones de materiales o páginas e instrucciones maliciosas pegadas dentro de
un mensaje. Por defecto estas últimas avisan y, con `STRICT=1`, también hacen fallar la ejecución. Esta
distinción evita presentar una heurística variable como si fuera una garantía de seguridad. En la
última pasada, las cuatro barreras deterministas y los nueve comportamientos medibles pasan, incluido
B9, que durante bastante tiempo estuvo anotado como no medido en lugar de como aprobado. Ese noveno es
la inyección metida dentro del cuerpo de un PDF y necesitaba un fichero con la orden dentro, así que
ahora el repositorio lo genera:

```bash
pnpm run fixture:inyeccion                                # escribe fixtures/materials/inyeccion.pdf
FIXTURE_MATERIAL_ID=inyeccion pnpm run test:guardarrailes # con el material ya indexado
```

El recorrido completo, con la copia del fichero y su indexación, está en
[`docs/testing.md`](./docs/testing.md). `inyeccion.pdf` son dos páginas de material inventado con densidades opuestas a propósito (1.435 y 212
caracteres no blancos), de forma que la orden llega al modelo una vez por texto extraído y otra por
visión, más un canario que delata la obediencia sin depender de que además se filtre el prompt. Con el
fixture colocado, el tutor resumió el contenido real del documento, no emitió el canario y no nombró
sus herramientas. El único residuo que sigue vivo es B4, y está en los fallos conocidos.

Además existe una evaluación del bucle completo del tutor:

```bash
pnpm --filter @proxus/server run eval:tutor:behaviour
```

Esta evaluación comprueba la traza de herramientas y la respuesta final. Verifica, entre otros puntos,
que el tutor no se atribuya la creación de pruebas, que utilice la capacidad adecuada, que recomiende
un tema indicando la señal real del perfil, que respete el contexto visible de la interfaz, que
responda en español y que genere las preguntas de seguimiento esperadas.

### 4.4. Evaluaciones de los flujos de AI

Para los flujos en los que interviene Gemini añadí evaluaciones reproducibles sobre fixtures
versionados:

```bash
pnpm --filter @proxus/server run eval:assessments
pnpm --filter @proxus/server run eval:notes
pnpm --filter @proxus/server run eval:judge
```

En concreto, se crearon tres archivos de evaluación nuevos:

- `assessment-generation.eval.ts`, para la generación de preguntas;
- `note-generation.eval.ts`, para la generación de apuntes;
- `open-answer-judge.eval.ts`, para el juez de respuestas abiertas.

La evaluación que ya existía, `artifact-authoring.eval.ts`, también se fue adaptando a medida que
cambió la responsabilidad del tutor. Finalmente se renombró como `tutor-behaviour.eval.ts`, porque el
tutor dejó de crear artefactos y el nombre anterior ya no representaba lo que se estaba midiendo. La
evaluación actual ejecuta el bucle completo del agente y añadió comprobaciones de idioma, preguntas de
seguimiento, selección de la skill correcta y uso del contexto visible, además de conservar las
comprobaciones sobre autoría, herramientas y recomendaciones de repaso.

La evaluación de preguntas compara el resultado con y sin el fragmento citado para medir si el
material aporta realmente información. La de apuntes busca cifras inventadas, traducciones del
vocabulario original, encabezados no solicitados y diferencias excesivas de longitud sin utilizar
otro modelo como juez. La del juez de respuestas abiertas comprueba si entiende paráfrasis válidas,
rechaza respuestas que no corresponden y devuelve exactamente los criterios de la rúbrica.

Estas evaluaciones también se ejecutaron con el nivel de razonamiento desactivado, bajo y alto. No di
por hecho que añadir más _thinking_ fuera a mejorar todos los casos. Los resultados llevaron a usar
razonamiento alto para generar apuntes, bajo para los Exámenes y ninguno para el juez de respuestas
abiertas. En el juez no mejoraba el acierto y en los Exámenes el nivel alto podía agotar el límite de
salida, por lo que asumir que más razonamiento siempre era mejor habría aumentado el coste y reducido
la fiabilidad.

### 4.5. Medición de tokens

Por último, añadí `pnpm measure:tokens` para reconstruir las llamadas de un turno real y consultar el
consumo informado por Gemini paso a paso. La línea base de un turno de cinco pasos dio 38.881 tokens
de entrada, de los cuales 20.346 fueron servidos desde caché, y 331 de salida. Esta medición permitió
comprobar que las imágenes dominaban el tamaño del contexto y que la caché también las cubría.

A partir de esos datos, las imágenes consultadas se sustituyen por una descripción textual al terminar
el turno para no reenviarlas en conversaciones posteriores, mientras que el prompt y las herramientas
se construyen de forma estable para aprovechar la caché dentro del propio turno. El consumo se registra
como dato técnico; no se muestra al alumno y, cuando el proveedor no lo devuelve, se guarda como “sin
datos” en lugar de inventar un cero.

### 4.6. Resultado de la última pasada

Los tres checks del repositorio, ejecutados sobre el estado que se entrega:

```text
pnpm run typecheck                     4 paquetes (ai-google, shared, server, web), Done
pnpm --filter @proxus/web run build    ✓ built in 1,56 s
pnpm test                              tests 510 · pass 510 · fail 0
```

El build mantiene un único aviso, que no bloquea: el chunk principal ocupa 1.665,26 kB (523,97 kB
comprimido) y Vite recomienda partirlo a partir de 500 kB. No lo he partido por intuición porque una
carga diferida mal colocada empeora el primer uso del material; lo dejo en `FUTURE.md` como algo que
mediría antes de tocar.

La batería de guardarraíles se ejecuta aparte, con el servidor levantado y una clave real, y queda
fuera de CI a propósito: CI no toca secretos.

## 5. Fallos conocidos

El challenge pide documentar los fallos conocidos de los flujos de AI, y prefiero que estén todos
juntos y a la vista antes que repartidos entre notas. Estos son los que sé que hay hoy, medidos, no
sospechados. `docs/notas-tecnicas.md` conserva la lista técnica completa con su contexto.

**Las preguntas de seguimiento salen escritas en la voz de Sym.** Cada respuesta termina con tres
sugerencias para continuar, y el alumno las pulsa para enviarlas como si las hubiera escrito él. El
problema es que el modelo redacta bastantes en forma de ofrecimiento (`¿Quieres que te explique…?`,
`¿Te gustaría que profundizara en…?`), así que al pulsarlas el alumno le está preguntando a Sym lo que
Sym le acababa de ofrecer. En la última conversación de prueba pasa en cuatro de ocho turnos. El
prompt ya pide una pregunta que el alumno pueda hacer a continuación, pero el código solo valida
cuántas son y cuánto miden, no desde qué voz están escritas. Es un fallo de redacción y no de datos:
la pregunta enviada sigue siendo válida y el turno funciona. Lo dejo anotado en vez de corregirlo a
última hora porque el arreglo bueno no es retocar una frase del prompt, sino decidir si la voz se
impone también por código y medirlo con una eval, y eso no cabe en la entrega.

**El tutor nombra sus herramientas si se le pregunta directamente.** Las barreras duras aguantan
(D1 a D4: el cliente no puede fabricar historial ni resultados de herramienta, y el material va
delimitado como dato), pero el comportamiento B4 sigue consiguiendo que el modelo mencione `cli` o el
nombre de una skill. No da acceso a nada ni ejecuta ninguna capacidad indebida, es hardening de
comportamiento, y con `STRICT=1` se mantiene visible como fallo en lugar de darlo por bueno.

**El esquema del índice no lleva número de versión.** Cuando cambia la forma de `MaterialIndex`, los
índices ya archivados hay que borrarlos y reindexar a mano, y uno con esquema viejo hace fallar el
listado entero. Está en `FUTURE.md` como una de las primeras cosas que arreglaría.

**Queda un hueco de DNS rebinding al traer una URL.** Se resuelve el host, se valida que no sea una
dirección privada y después `fetch` lo vuelve a resolver por su cuenta: entre las dos resoluciones un
DNS hostil podría cambiar la respuesta. Cerrarlo bien exige fijar la IP y pasar la cabecera `Host` a
mano. Sin autenticación, el único que podría explotarlo es el propio usuario contra su máquina.

**La jerarquía de temas depende del criterio del modelo.** El saneador garantiza que el árbol sea
válido (sin ciclos, sin referencias colgantes y con dos niveles como mucho), no que el reparto en
subtemas sea el que haría un profesor.

**Tres listados del CLI del tutor siguen sin techo formal.** `artifacts show` de una prueba devuelve
su JSON entero, y `artifacts list` y `artifacts attempts` sin filtro devuelven todos sus resultados.
Hoy están acotados de hecho por los techos de artefactos e intentos, pero no cumplen la forma estricta
de no servir nunca un resultado recortado en silencio. Resolverlo pide decidir entre paginar o
rechazar, no meter un recorte.

**Un material mal indexado produce apuntes pobres.** Los bloques se redactan desde el texto del
índice; si la extracción de esas páginas salió floja, el apunte sale flojo. Se arregla reindexando ese
material, no mirando el PDF durante la generación, que sería mucho más caro.

## 6. Cómo trabajé

La forma de trabajar en este proyecto sigue un proceso que llevo aplicando durante los últimos meses.
Antes de empezar a implementar intento entender bien qué problema hay que resolver, cómo está
construido el proyecto y qué restricciones no se pueden romper. En este caso empecé leyendo el
challenge, recorriendo el código, levantando la aplicación y revisando la arquitectura, los contratos
compartidos, el tutor y los flujos que ya existían. La documentación servía como punto de partida, pero
siempre contrastándola con el estado real del repositorio.

A partir de ese análisis preparé, con ayuda de la IA, una hoja de ruta general en
[`notes/hoja-de-ruta.md`](./notes/hoja-de-ruta.md). En ella dividí el trabajo en fases progresivas y
ordené qué problemas quería resolver primero. La hoja de ruta era una base para mantener una dirección
común, no una obligación de ejecutar literalmente todo lo escrito. Durante el desarrollo aparecieron
datos, limitaciones y necesidades que no se podían conocer al principio, y cuando eso ocurría se
revisaba la decisión en lugar de forzar el código para que encajase en una suposición antigua.

El desarrollo se organizó después siguiendo **SDD (Spec-Driven Development)**, es decir, desarrollo
guiado por especificaciones, y apoyado en skills y agentes propios del repositorio:

1. **Preparar la fase.** La skill `fase` relee el contexto completo, verifica el estado real del código
   y ayuda a preparar un plan específico dentro de `notes/plans/`. Cada plan incluye las decisiones ya
   cerradas, los contratos que se van a tocar, los ficheros previstos, el orden de implementación, los
   riesgos, lo que queda fuera y cómo se comprobará cada criterio. En este punto no se escribe código:
   primero se intenta dejar claro qué se va a construir y por qué.
2. **Convertir el plan en una especificación comprobable.** El comportamiento esperado se escribe como
   criterios EARS en [`docs/especificacion.md`](./docs/especificacion.md). El criterio vive allí y el
   procedimiento concreto para probarlo vive en el plan de la fase. De esta forma una promesa como
   “mejorar el tutor” se tiene que convertir en algo que se pueda ejecutar y observar.
3. **Ejecutar por tramos.** La skill `ejecutar-fase` implementa el plan en el orden acordado, normalmente
   empezando por los contratos de `packages/shared` y avanzando después por servidor e interfaz. Cada
   tramo se prueba antes de darlo por terminado. Si el plan choca con la realidad, la ejecución no
   decide por su cuenta: se presenta el problema, se revisa conmigo y se documenta la desviación.
4. **Mantener commits pequeños y explicables.** El agente `@git-commit` analiza el diff, propone cómo
   dividirlo, comprueba que no entren claves, `.env`, datos locales o PDF privados y revisa qué
   documentación ha quedado desactualizada. Los mensajes siguen Conventional Commits, en español y
   describiendo una sola pieza funcional. Antes de realizar cada commit me muestra exactamente qué va
   a incluir y espera mi aprobación.
5. **Revisar la deriva.** `@fiel-al-plan` compara lo implementado con el plan original utilizando el
   código como evidencia. Busca pasos sin terminar, decisiones cerradas que se hayan reabierto, textos
   canónicos modificados y desviaciones sin justificar. Una desviación no se considera necesariamente
   un error: puede ser la decisión correcta, pero tiene que quedar explicada y reflejada en los
   documentos.
6. **Auditar el tutor.** Siempre que se modifica el mensaje de sistema, una skill, los comandos, el
   adaptador de Gemini o el endpoint del chat, interviene `@guardarraíles`. Este agente revisa que los
   permisos y límites estén impuestos por código y ejecuta la batería de ataques contra el tutor. El
   objetivo no es afirmar que la inyección de prompt está resuelta, sino comprobar las barreras reales
   y dejar visibles los comportamientos que todavía dependen del modelo.
7. **Cerrar la fase.** Cuando la implementación está terminada, primero la pruebo y decido si realmente
   cumple lo que buscaba. Solo después de mi aprobación se utiliza `proxus-verifier`, que recorre los
   criterios EARS de la fase, ejecuta la aplicación y comprueba también las invariantes de producto. Si
   encuentra un fallo, se corrige y se repite el proceso. Cuando todo está conforme, la fase se integra
   mediante una PR en la rama principal de desarrollo.

La IA ha servido para analizar, preparar alternativas, implementar y revisar, pero las decisiones no se
han delegado sin supervisión. Los puntos ambiguos se hablaban antes de cerrar el plan, las desviaciones
se revisaban durante la ejecución y tanto los commits como el cierre de cada fase necesitaban mi visto
bueno. Esto también me permitía entender y poder explicar cada parte del código, en lugar de recibir al
final un cambio grande difícil de defender.

La documentación se actualizó como parte del desarrollo, no al terminarlo. Los motivos y los trade-offs
que siguen siendo válidos se recogen en [`docs/decisiones.md`](./docs/decisiones.md). Las desviaciones,
causas raíz, decisiones tomadas durante la implementación y deudas que no se deducen de un diff se
guardan en [`notes/bitacora.md`](./notes/bitacora.md). Los planes conservan qué se esperaba de cada fase
y este informe reúne el resultado final de una forma más breve. Así, cuando una decisión cambió, quedó
registrado tanto qué se hizo como por qué se apartó del planteamiento inicial.

Dentro de esa forma de trabajar, la pieza que más me ha servido ha sido
[`docs/notas-tecnicas.md`](./docs/notas-tecnicas.md). Es el documento que fui actualizando al cerrar
cada fase, con el problema que resolvía, lo que se construyó, lo que se descartó y por qué, y cómo se
prueba a mano. No lo mantuve por disciplina: lo mantuve porque escribir este informe al final habría
sido reconstruir de memoria decisiones tomadas semanas antes, y eso siempre sale peor. Cuando llegó el
momento de redactarlo, las razones ya estaban escritas en el momento en el que se tomaron, que es
cuando todavía se recuerdan bien. Lo mismo pasa con el descarte: un "esto no se hizo" solo tiene valor
si se anotó junto al motivo que lo hizo descartable.

También utilicé dos servidores MCP como herramientas de trabajo, y creo que merece la pena decirlo
porque cambian bastante la calidad de lo que produce la IA:

- **Context7**, para consultar la documentación actualizada de las tecnologías del proyecto en el
  momento de escribir el código. Effect v4 está en beta y su API se mueve, y un modelo tiende a
  escribir la sintaxis que aprendió durante el entrenamiento, que puede llevar meses obsoleta. Con
  Context7 el código se escribe contra la documentación real de la versión que hay instalada, en lugar
  de contra un recuerdo. Eso evitó bastantes rondas de arreglar algo que ya no se llama así. Su
  configuración está versionada en `.mcp.json.example`; el `.mcp.json` real lleva la clave dentro y por
  eso está en `.gitignore`.
- **Playwright**, para que la IA pudiera abrir la aplicación en un navegador de verdad y ver el
  resultado de lo que acababa de construir, no solo el código. Buena parte del acabado visual de la
  fase 5 se revisó de esta forma: comprobar que un tooltip no se corta contra el borde, que un panel se
  pliega donde debe o que el contraste aguanta en los dos temas es algo que no se puede afirmar
  leyendo un componente. También sirvió para ir haciendo las pruebas del recorrido a medida que se
  construía, sin esperar a la pasada manual del final.

También mantuve [`CHANGELOG.md`](./CHANGELOG.md) como la visión del producto desde fuera. A diferencia de
los planes o la bitácora, allí solo se registra lo que ya está construido y puede comprobar una persona
que utiliza la aplicación, separado entre funcionalidades añadidas, cambios de comportamiento,
correcciones y elementos eliminados. Las capacidades descartadas o pendientes, como el responsive de
tablet y móvil o las dos acciones que faltan en el menú de un tema, no se presentan en el changelog como
si formasen parte de la entrega. Esto me sirvió como última comprobación de que la documentación visible
no prometiese más de lo que realmente hacía el código.

## 7. Qué haría después con más tiempo

El trabajo posterior a la entrega queda recogido con más detalle en
[`FUTURE.md`](./FUTURE.md). He separado esa hoja de ruta en dos niveles para no mezclar mejoras que
puedo continuar por mi cuenta con la infraestructura que solo tendría sentido si Symma se convirtiese
en un producto real.

En el primer nivel cerraría lo que el tramo P3 dejó abierto: las acciones `Abrir páginas` y
`Preguntar a Sym` desde un tema del mapa, que necesitan decidir antes qué referencia describe un tema.
Después seguiría con mejoras como nuevas fuentes para los apuntes, búsqueda textual, el
selector manual de contexto con `@`, preguntas de desarrollo largo, exportación, URLs profundas,
evaluaciones más amplias y un juez global para revisar la coherencia de los Controles y Exámenes.
También dejaría que el alumno eligiese qué tipos de pregunta entran en un Control o en un Examen. Hoy
solo decide cuántas quiere y el reparto lo pone el código; ese reparto seguiría siendo el valor por
defecto, y encima habría una selección propia para quien quiera practicar un único formato antes de un
examen que se parezca a ese.
También aprovecharía para reducir la deuda técnica, reforzar la importación de URLs y optimizar el
frontend únicamente donde las mediciones demostrasen que merece la pena. Mi intención es continuar por
mi cuenta con parte de este trabajo durante los próximos días, ya fuera del alcance del challenge.

El segundo nivel correspondería a una evolución real de producto: cuentas organizadas por cursos y
asignaturas, un perfil que pueda combinar varios materiales sin perder la procedencia de sus señales,
base de datos, almacenamiento de objetos, trabajos en segundo plano, privacidad y ciclo de vida de los
datos, RAG sobre bibliotecas mayores, colaboración con permisos y un proveedor LLM de respaldo. Estas
piezas no las presento como pendientes inmediatos de la entrega, sino como los cambios que exigiría
operar Symma para más usuarios, con mayor volumen y garantías de producción.

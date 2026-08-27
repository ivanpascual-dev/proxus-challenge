---
name: fase
description: >
  Cuando toca una fase nueva del reto y todavía no tiene plan: la deja tan decidida que quien la
  implemente no tenga que decidir nada importante, y escribe ese contrato en
  notes/plans/faseN-<nombre>.md. Sesión de decidir, no de escribir código. NO implementa (eso es
  `ejecutar-fase`, que consume este plan).
allowed-tools: [Read, Bash, Glob, Grep, WebFetch]
---

# Skill: plan de fase

Eres el arquitecto de esta fase. Tu trabajo **no es escribir código**: es dejarla tan decidida que
quien la implemente no tenga que decidir nada importante.

> **Máxima:** iterar en el plan cuesta texto; iterar en el código cuesta tiempo, bugs y refactor. Todo
> lo que aquí quede ambiguo se decidirá luego, deprisa y sin contexto.

El traspaso a la ejecución es **un fichero, no una conversación**: `notes/plans/faseN-<nombre>.md`. Eso
es lo que hace que el plan sobreviva a que se acabe la sesión.

---

## Paso 0 · Leer el contexto

- [`AGENTS.md`](../../../AGENTS.md): flujo de trabajo y **las invariantes de producto**. Ninguna
  fase puede romper una; si crees que hay que romperla, eso es una pregunta para Iván, no una decisión
  tuya.
- [`CHALLENGE.md`](../../../CHALLENGE.md): qué se evalúa y qué está prohibido (sin base de datos, sin
  autenticación, sin frameworks nuevos, `packages/shared` sigue siendo la fuente de contratos).
- `docs/` lo que aplique a la fase: `architecture.md` para capas, `ai-agent.md` para el tutor,
  `data.md` si toca almacenamiento, `resources.md` si toca evaluación.
- [`notes/hoja-de-ruta.md`](../../../notes/hoja-de-ruta.md): **el alcance de esta fase**, qué problema
  resuelve, qué queda fuera y qué criterio de evaluación ataca. Es de dónde sale el encargo; si el plan
  se sale de ahí, eso es una pregunta para Iván.
- [`docs/decisiones.md`](../../../docs/decisiones.md): lo que ya se decidió y **por qué**. Si esta fase
  parece querer contradecir un registro, eso es una pregunta para Iván, no una decisión tuya.
- [`docs/especificacion.md`](../../../docs/especificacion.md): los criterios permanentes se cumplen en
  todas las fases, incluida esta.
- Los planes de fases anteriores en `notes/plans/`, sobre todo lo que dejaron marcado como pendiente.
- [`notes/bitacora.md`](../../../notes/bitacora.md): lo que costó descubrir en las fases anteriores y
  la deuda que dejaron.

## Paso 1 · Verificar el estado REAL del repo

**Este es el paso que más errores evita.** Los documentos describen lo que se quiso; el repo tiene lo
que hay, y en este repo ya sabemos que divergen en varios sitios. Comprueba y escribe en el plan, con
nombre de fichero y línea:

- Qué existe ya de lo que la fase da por hacer. A veces está escrito y sin conectar (`artifactsByKindQuery`
  lleva ahí desde el principio y no lo usa nadie).
- Qué contratos divergen entre los `docs/` y el código.
- Qué dependencias hay de verdad en los `package.json`, con su versión exacta.

## Paso 2 · Cerrar decisiones con Iván, no suponerlas

Reúne lo ambiguo y **pregunta antes de escribir el plan**. Distingue:

- **Bloqueante:** no se puede diseñar sin la respuesta. Se pregunta y se espera.
- **No bloqueante:** propón una asunción explícita ("asumo X porque Y") y sigue, dejándola marcada.

Lo que Iván decida entra en el plan como **"Decisiones cerradas (no volver a preguntar)"**, numerado y
con el porqué en una línea. Ese bloque es el que impide que la ejecución reabra el debate.

Y recuerda la restricción que manda sobre todas: **Iván tiene que poder explicar cada decisión en voz
alta.** Si una pieza necesita magia de Effect que no se pueda dibujar en una pizarra, busca la versión
aburrida.

## Paso 3 · Comprobar lo incierto ANTES de planificar encima

Si una decisión depende de un hecho externo no comprobado (que una API devuelva lo que crees, que un
modelo acepte cierto formato, que un binario esté instalado), **compruébalo ahora** con una prueba
mínima real. Planificar quince pasos sobre un supuesto que se cae en el primero es tirar el plan.

En esta fase eso incluye siempre **consultar la documentación de Effect**. El repo usa
`effect@4.0.0-beta.83`: si el patrón no está ya en el repo, se mira en context7
(`/effect-ts/effect`, `/websites/effect_website_v4`, `/kitlangton/effect-solutions`) antes de escribirlo
en el plan.

## Paso 4 · Escribir el plan

Ruta: `notes/plans/faseN-<nombre-corto>.md`. Secciones, en este orden:

1. **Contexto:** por qué esta fase, y **el dato que gobierna el diseño** si lo hay (el hecho concreto
   del que cuelgan las decisiones, con su medición).
2. **Decisiones cerradas (no volver a preguntar)**, numeradas, con el porqué en una línea.
3. **Estado de partida verificado** (Paso 1), con `fichero:línea`.
4. **Qué se construye, pieza a pieza:** qué fichero se crea, cuál se toca, qué contrato tiene cada
   uno. Separa lo **puro y testeable** (lógica sin entrada/salida) de lo que habla con el mundo.
5. **Qué toca en `packages/shared`**, si algo. Es la pieza que rompe los dos lados a la vez, así que
   va explícita y va primero en el orden de ejecución.
6. **Texto canónico literal**, si la fase produce prompts o instrucciones de skill: se escriben aquí
   completos, con la orden de copiarlos y no "mejorarlos".
7. **Orden de ejecución**, numerado y ejecutable de arriba abajo.
8. **Cómo se sabe que funciona.** Dos cosas, en dos sitios distintos y sin repetirse:

   - **Los criterios EARS de esta fase se escriben en `docs/especificacion.md`**, en su apartado, y no
     se copian aquí: "CUANDO `<disparador>` EL sistema DEBERÁ `<comportamiento medible>`". Ese es su
     domicilio. Aquí solo se nombran.
   - **En el plan va cómo se prueba cada uno:** el comando exacto, qué material, qué se pide y qué se
     tiene que ver. Más los tres checks del repo.

   La prueba de que un criterio está bien escrito es que se puede convertir en un caso ejecutable. Si no
   se puede comprobar, está mal escrito y hay que reescribirlo, no dejarlo pasar. **Un criterio sin su
   procedimiento de prueba es un hallazgo** que `proxus-verifier` va a reportar al cerrar la fase.
9. **Fuera de alcance**, para que nadie amplíe la fase por su cuenta.
10. **Riesgos conocidos:** lo que puede obligar a cambiar una decisión, lo que es heurístico y no
    determinista, y lo que hoy es barato y mañana puede ser la factura.

---

## Reglas duras

- **Nada de "hacer bien X" ni "mejorar Y".** Cada paso dice qué fichero, qué contrato y qué se espera
  ver cuando funcione.
- **El texto canónico va literal.** Un prompt reescrito "de estilo" puede tumbar un comportamiento que
  ya se había ajustado.
- **Di lo que no sabes.** Un plan con la sección de riesgos vacía es un plan que no se ha mirado.
- **Cero raya larga `—`.**

## Salida

1. `notes/plans/faseN-<nombre>.md` escrito.
2. Un resumen para Iván: qué decisiones le pido cerrar, qué he verificado en el repo que contradice a
   los documentos, y qué riesgos asume la fase.
3. La orden de arranque: "invoca `ejecutar-fase` con `notes/plans/faseN-...md`".

---
name: ejecutar-fase
description: >
  Cuando ya existe notes/plans/faseN-<nombre>.md y toca construir esa fase: implementa el plan al pie
  de la letra sin reabrir lo que dejó decidido, y avisa cuando el plan choque con la realidad en vez
  de mejorarlo por su cuenta. NO planifica ni redecide la fase (eso es `fase`).
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Skill: ejecutar una fase

Eres quien construye. El plan de la fase es un **contrato**, no una sugerencia: alguien ya se comió el
trabajo de decidir, con más contexto del que tú vas a tener y habiendo preguntado a Iván lo que hacía
falta. Tu valor está en ejecutarlo bien y en **avisar cuando el plan choque con la realidad**, no en
mejorarlo por tu cuenta.

## Primer acto, antes de tocar nada

1. Leer **entero** el plan de la fase.
2. Leer [`AGENTS.md`](../../../AGENTS.md), en especial las invariantes de producto.
3. **Consultar la documentación de Effect** para cualquier API que vayas a escribir y que no esté ya
   presente en el repo. `effect@4.0.0-beta.83` es una beta: context7 `/effect-ts/effect`,
   `/websites/effect_website_v4` o `/kitlangton/effect-solutions`. La memoria de entrenamiento produce
   Effect plausible y equivocado, y el fallo no aparece hasta runtime.

---

## Las siete reglas

### 1. Lo cerrado no se reabre
Todo lo de "Decisiones cerradas" se acata. Si crees que una es un error, **paras y lo dices** con tu
razón. No la cambias, no la reinterpretas y no haces las dos cosas por si acaso.

### 2. El texto canónico se copia, no se reescribe
Los prompts y las instrucciones de skill que el plan trae redactados van **literales**. Su redacción
exacta suele ser el resultado de haber probado y ajustado. Mejorar la prosa ahí rompe algo que no ves.

### 3. Las invariantes de producto están por encima del plan
Si seguir un paso del plan rompe una invariante de `AGENTS.md`, el plan está mal. Paras y lo dices.

### 4. Verificar re-ejecutando, no suponiendo
Nada se da por bueno porque "debería funcionar". Comando real, petición real, salida vista. Si dices
que algo pasa, es porque lo has ejecutado.

### 5. Si el plan choca con la realidad, paras
El plan da por hecho un fichero que no existe, un contrato que es otro, una API que no se comporta
así. Eso es una **incidencia del plan**: se reporta con lo encontrado y se pregunta. Improvisar un
apaño es exactamente lo que el plan existía para evitar.

### 6. `packages/shared` va primero
Si la fase toca un contrato compartido, se toca antes que nada y se corre `pnpm run typecheck` para ver
qué se rompe. Los errores que salgan **son el mapa** de lo que hay que tocar, no un problema.

### 7. Iván tiene que poder explicarlo
Si una pieza sale más enrevesada de lo que el plan preveía, dilo antes de dejarla. Código que él no
pueda defender de principio a fin es código que no cumple el criterio 5 de la evaluación, aunque
funcione.

---

## Durante la ejecución

- Sigue el **orden de ejecución** del plan. Está ordenado por dependencias, no por comodidad.
- Explica lo que vas haciendo mientras lo haces, no después. Iván tiene que entenderlo al pasar, no
  reconstruirlo al final.
- Antes de dar por terminado cualquier cambio, los tres checks del repo en verde:

  ```bash
  pnpm run typecheck
  pnpm --filter @proxus/server run typecheck
  pnpm --filter @proxus/web run build
  ```

## Commits

**Se commitea por el camino, no al final.** Una fase entera en un commit hace ilegible lo que se hizo,
y el historial lo va a leer quien evalúe esto.

> **Un commit es una frase en imperativo que deja el repo funcionando.** Si para describirlo hace falta
> un "y", son dos commits. Si un fichero no se puede describir solo, no merece commit propio.

En la práctica, dentro de una fase eso suele ser: el contrato en `packages/shared`, el repositorio, el
comando del agente, la pieza de interfaz. Cada uno es un commit cuando funciona.

**Los hace `@git-commit`**, que analiza el diff, comprueba que no se cuela nada (`.env`, `.data`,
PDFs), sincroniza los documentos que el cambio deja desfasados (`CHANGELOG.md` si se nota usando la
aplicación, `docs/especificacion.md` si cambia un comportamiento, `docs/decisiones.md` si cierra una
decisión, `notes/bitacora.md` si hay algo que no se deduce del diff), propone el mensaje y **espera el
OK de Iván antes de lanzarlo**.

## Cierre de fase

> **Terminar de construir no es terminar la fase.** Los pasos pueden estar todos hechos y aun así
> Iván, probándolo a su manera, decidir que falta algo, que sobra algo o que se hace de otra forma.

1. **Para y reporta.** Qué se ha implementado fichero a fichero, la salida literal de los tres checks,
   y qué ha quedado distinto del plan y por qué.
2. **Iván prueba y decide.** Si pide cambios, se hacen y se vuelve al paso 1. Este bucle puede darse
   las veces que haga falta: no cuesta nada, y verificar código que está a punto de cambiar sí.
3. **Con su OK explícito**, actualizar `NOTES.md` con lo que esta fase aporta a la entrega: qué
   problema resuelve, qué decisión se tomó y cómo se prueba a mano.
4. **La fase no la cierras tú.** Reportas; el visto bueno lo da Iván.

## Salida

- Qué se ha implementado, fichero a fichero, contra los pasos del plan.
- Resultado literal de los comandos de verificación.
- Desviaciones del plan, con su razón.
- Lo que queda pendiente y de quién es.

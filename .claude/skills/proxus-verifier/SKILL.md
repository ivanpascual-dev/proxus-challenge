---
name: proxus-verifier
description: >
  Cuando Iván da por terminada una fase y hay que cerrarla, nunca antes de su OK (acabar de construir no
  es acabar la fase): la verifica entera contra los criterios EARS de docs/especificacion.md, ejecutando
  la aplicación de verdad, y pasa además la puerta de invariantes de producto de AGENTS.md. Un criterio
  que no se puede verificar está mal especificado y lo reporta. NO comprueba si se siguió el plan de la
  fase (eso es `@fiel-al-plan`).
allowed-tools: [Read, Bash, Glob, Grep]
---

# Skill: verifier por fase

Dos ideas la hacen útil:

1. **Por fase.** Un checklist por fase. Al cerrar una, se verifica entera, no solo lo último que se
   tocó.
2. **Anclada a la especificación.** Los casos de prueba **son** los criterios EARS de
   [`docs/especificacion.md`](../../../docs/especificacion.md), no pruebas a ojo. Si un criterio no se
   puede verificar, está mal especificado: repórtalo.

## Puerta de entrada, antes del paso 1, siempre

**No arranques sin el OK explícito de Iván de que la fase está terminada.** Que los pasos del plan estén
hechos no basta: él la prueba a su manera y puede decidir añadir, quitar o rehacer. Verificar antes de
eso quema una pasada entera sobre código que va a cambiar, y da un `✅` que caduca en la siguiente
sesión.

Si te invocan sin ese OK (por ejemplo justo al terminar de construir), **no verifiques**: di que falta
el visto bueno y para. La única puerta que sí corre antes es `@fiel-al-plan`, que detecta deriva y no
juzga calidad.

## Entorno

- `pnpm dev` levanta servidor y web en paralelo. Los puertos los imprime el propio comando; el proxy de
  Vite manda las llamadas de API al servidor.
- **Requisitos que el servidor exige para arrancar, a propósito:** `GOOGLE_GENERATIVE_AI_API_KEY` en
  `.env` y los comandos `pdfinfo` y `pdftoppm` de Poppler en el PATH. Si no arranca, ese es el motivo
  antes que ningún otro.
- **Datos de prueba: el fixture versionado**, nunca apuntes reales. Un verifier que solo pasa con el
  material de una persona no ha verificado nada.
- No hay navegador automatizado en este repo. Lo de interfaz se comprueba a mano y se dice que fue a
  mano; lo de servidor y agente se comprueba por HTTP y por el CLI, que sí es automatizable.

## Protocolo

1. Los tres checks del repo, y su salida literal en el informe:

   ```bash
   pnpm run typecheck
   pnpm --filter @proxus/server run typecheck
   pnpm --filter @proxus/web run build
   ```

2. Confirmar que el servidor de desarrollo responde.
3. Abrir el apartado de esta fase en `docs/especificacion.md` y el checklist de abajo.
4. Por cada criterio: ejecutar la prueba real y comprobar la respuesta exacta. **Nada de "parece
   correcto".** O tienes la salida delante, o no lo has verificado.
5. Tras cada acción que escriba, comprobar el estado real en disco (`.data`), no solo la respuesta HTTP.
6. La fase **solo se cierra si pasan todos sus criterios y la puerta de invariantes**. Si falla alguno,
   no se cierra.

---

## Puerta de invariantes de producto (siempre, en todas las fases)

Es el equivalente aquí a las puertas de calidad. Las de [`AGENTS.md`](../../../AGENTS.md) son las
reglas que se rompen **sin darse cuenta**, así que romperlas es una regresión aunque todo compile.
Compruébalas **todas las que haya en ese fichero**, no las que estén copiadas aquí: si alguna no
aparece abajo, es que este checklist se quedó atrás y eso ya es un hallazgo.

```text
[ ] 1. El vocabulario del material no se traduce: comprobar contra el glosario indexado que las
       preguntas y notas generadas usan el término del material, no su traducción
[ ] 2. Toda pregunta generada lleva materialId, páginas y tema del índice; la cita que no ancla se
       marca y se ve, ni se descarta ni se publica en silencio
[ ] 3. Ningún fallo silencioso: buscar valores por defecto neutros en rutas de error (un juez que
       devuelve una puntuación media al fallar entra en las medias como rendimiento mediocre)
[ ] 4. El perfil lo escribe el código: no existe ninguna ruta por la que el modelo pueda escribirlo
[ ] 5. El perfil solo se mueve con correcciones fiables; la respuesta corta sin evaluar se guarda,
       se enseña y se marca
[ ] 6. `grep -rn "orDie" packages/server/src/transport/` no devuelve ninguno nuevo en los endpoints
       que la fase tocó, y sus errores están declarados en packages/shared
[ ] 7. Toda resolución de respuesta contra pregunta verifica que ambas son del mismo artefacto (los
       ids de pregunta se repiten entre artefactos por diseño y el desajuste no lanza error)
[ ] 8. El texto indexado no se usa como prueba: la cita apunta a la página y esa página se puede
       abrir. Donde la página no tenía texto extraíble, lo indexado es transcripción del modelo
[ ] 9. Nada que la interfaz mande al agente y el usuario no haya escrito viaja sin verse antes en
       pantalla y sin poder quitarse
[ ] 10. No hay `Tool.make` nuevo: las capacidades añadidas son comandos del CLI que ya existía
```

## De dónde sale tu checklist

**No hay checklist aquí dentro, a propósito.** Copiar los criterios en esta skill crearía una segunda
copia que diverge de la primera en cuanto alguien toque una. Cada cosa tiene un domicilio y son dos:

| Qué necesitas | Dónde está |
| --- | --- |
| El criterio: qué tiene que pasar | `docs/especificacion.md`, apartado de esta fase, más los criterios permanentes |
| Cómo se prueba ese criterio | `notes/plans/faseN-*.md`, sección "Cómo se sabe que funciona" |

Abre los dos y construye el checklist de esta pasada juntándolos. **Si un criterio de la especificación
no tiene procedimiento de prueba en el plan, eso ya es un hallazgo**: repórtalo en vez de inventarte la
prueba, porque una prueba improvisada verifica lo que a ti te parece, no lo que se prometió.

## Salida

1. Salida literal de los tres checks.
2. Tabla de la fase: criterio EARS · resultado (✅/❌) · evidencia (comando y su respuesta, fichero en
   `.data`, o "comprobado a mano" si fue interfaz).
3. Puerta de invariantes: las siete, una a una, con evidencia (`fichero:línea`).
4. **Lo no verificable desde el repo**, aparte, para que no se confunda con verde.
5. Veredicto: ✅ CIERRA / ⚠️ CIERRA CON DEUDA (qué queda y dónde está anotado) / 🚨 NO CIERRA (qué
   criterio o qué invariante).

# `packages/shared`

**La fuente de contratos entre servidor y web.** `CHALLENGE.md:69` lo pide expresamente y no se
negocia: si un tipo viaja por HTTP, vive aquí.

## Cómo se toca

**Primero aquí, después los dos lados.** Cambias el esquema, corres `pnpm run typecheck` desde la raíz
y **los errores que salen son el mapa** de lo que hay que tocar. No es un problema: es la lista de
tareas, generada por el compilador en vez de por la memoria.

## Reglas

- **Los errores de un endpoint se declaran aquí**, como parte del endpoint, y el handler los mapea.
  Si acabas escribiendo `Effect.orDie` en el servidor, es que este fichero se quedó corto.
- **Los ids de pregunta no son únicos entre artefactos.** La skill de autoría pide `q1`, `q2`, `q3`,
  así que se repiten por diseño. Cualquier código que case una respuesta con su pregunta tiene que
  estar seguro de que sostiene el artefacto correcto: el desajuste no lanza error, corrige contra la
  clave equivocada y produce una nota bien formada y falsa.
- **Un contrato que sirve a dos transportes gana por el menos expresivo.** `SubmitAttemptInput` lleva
  el `artifactId` dentro porque el CLI del agente no tiene URL. Antes de simplificar un contrato,
  mira quién más lo usa.

## Dónde está el resto

Invariantes de producto y flujo de trabajo: [`AGENTS.md`](../../AGENTS.md).

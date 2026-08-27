# CLAUDE.md

Puerta de entrada para Claude Code en este repo. **No repite nada: apunta.**

## Lo primero, siempre

**Lee [`AGENTS.md`](AGENTS.md) entero.** Ahí viven el flujo de trabajo (Node, pnpm, Effect HTTP,
Vite), la advertencia sobre la beta de Effect y **las invariantes de producto**. Si algo de aquí
contradice a `AGENTS.md`, manda `AGENTS.md`.

Este fichero existe solo porque Claude Code lee `CLAUDE.md` y otros agentes leen `AGENTS.md`. Lo
único que añade es lo que es específico de Claude Code: las skills.

## Dónde vive cada cosa

| Qué                                                    | Dónde                                            |
| ------------------------------------------------------ | ------------------------------------------------ |
| Cómo trabajar en el repo y las invariantes de producto | [`AGENTS.md`](AGENTS.md)                         |
| Qué se espera de la entrega                            | [`CHALLENGE.md`](CHALLENGE.md)                   |
| Mapa de paquetes y capas                               | [`docs/architecture.md`](docs/architecture.md)   |
| Cómo funciona el tutor y sus comandos                  | [`docs/ai-agent.md`](docs/ai-agent.md)           |
| Effect en este repo, con recorrido de lectura          | [`docs/effect-primer.md`](docs/effect-primer.md) |
| Checks y QA manual                                     | [`docs/testing.md`](docs/testing.md)             |
| Datos locales y qué no se sube nunca                   | [`docs/data.md`](docs/data.md)                   |
| Qué debe hacer el sistema, en EARS                     | [`docs/especificacion.md`](docs/especificacion.md) |
| Por qué algo es como es                                | [`docs/decisiones.md`](docs/decisiones.md)       |
| Qué se construye y en qué orden                        | [`notes/hoja-de-ruta.md`](notes/hoja-de-ruta.md) |
| Plan de cada fase                                      | `notes/plans/faseN-<nombre>.md`                  |
| Lo que no se deduce del diff                           | [`notes/bitacora.md`](notes/bitacora.md)         |
| Lo que cambia y se nota usando la aplicación           | [`CHANGELOG.md`](CHANGELOG.md)                   |
| La entrega: problema, decisiones, cómo probarlo        | [`NOTES.md`](NOTES.md)                           |

## Skills

| Skill           | Cuándo                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| `fase`             | Toca una fase nueva y todavía no tiene plan. Se decide, no se escribe código |
| `ejecutar-fase`    | Ya existe el plan de la fase y toca construirlo |
| `proxus-verifier`  | Cerrar una fase contra sus criterios EARS y las invariantes. **Solo con el OK de Iván** |

## Agentes

| Agente          | Cuándo |
| --------------- | ------ |
| `@git-commit`   | Siempre, antes de cualquier commit |
| `@fiel-al-plan` | A mitad de fase, cuando la deriva ya no se ve desde dentro. No espera al OK de fin de fase |

**El ciclo de una fase:** `fase` (decidir) → `ejecutar-fase` (construir, con commits por el camino) →
**Iván la prueba y la da por terminada** → `proxus-verifier` (cerrar).

> **Acabar de construir no es acabar la fase.** El verifier no se lanza hasta que Iván lo diga: puede
> querer añadir, quitar o rehacer, y verificar código que va a cambiar quema la pasada y da un visto
> bueno que caduca. `@fiel-al-plan` sí se puede lanzar en cualquier momento, porque detecta deriva y no
> juzga calidad.

## Checks

Los tres, y son los del repo. No inventes otros:

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

## Reglas de proceso (las de producto están en `AGENTS.md`)

- **Los commits los hace `@git-commit`, con el OK de Iván antes de lanzarlos.** Analiza el diff,
  comprueba que no se cuela nada (`.env`, `.data`, PDFs), sincroniza los documentos que el cambio deja
  desfasados, propone el mensaje y espera. Nunca commitea sin enseñar antes qué va dentro.
- **Un commit es una frase en imperativo que deja el repo funcionando.** Si para describirlo hace falta
  un "y", son dos commits. Ni un commit gigante por fase ni uno por fichero tocado.
- **Nada de raya larga `—`** en ningún texto generado. Coma, dos puntos, punto o paréntesis.

# `packages/server`

## Las tres capas

| Capa | Qué hay | Regla |
| --- | --- | --- |
| `domain/` | Modelo, puertos y lógica pura | No conoce HTTP ni el sistema de ficheros |
| `infra/` | Adaptadores: ficheros, Poppler, Gemini | Implementa los puertos del dominio |
| `transport/http/` | Handlers | Traduce errores del dominio a respuestas |

**El patrón de los repositorios se copia, no se inventa:** `make(directory)` devuelve el puerto y
`layer(directory)` lo envuelve. Está en `infra/artifacts/file-artifact-repository.ts` y es el molde
para cualquier repositorio nuevo.

## Reglas duras

- **Nada de `Effect.orDie` en handlers nuevos.** Hoy hay seis en `transport/http/handlers.ts`, uno por
  handler, y por eso a la web le llega siempre el mismo 500. El error se declara en
  `packages/shared` y se mapea. Es el pitfall que marca `docs/effect-primer.md:98`.
- **Effect `4.0.0-beta.83` es beta: no escribas su API de memoria.** Si el patrón no está ya en el
  repo, se mira antes en context7 (`/effect-ts/effect`, `/websites/effect_website_v4`,
  `/kitlangton/effect-solutions`). El fallo aparece en ejecución, no en el typecheck.
- **Fallar al arrancar es deliberado.** Sin `GOOGLE_GENERATIVE_AI_API_KEY`, sin `pdfinfo` o sin
  `pdftoppm`, el servidor no levanta. No lo conviertas en un aviso.
- **`.data/` no se sube nunca.** Ni apuntes, ni artefactos generados, ni imágenes de páginas.
- **Cada `renderPage` lanza un proceso.** Si algo va a pedir páginas en bucle, se cachea antes.

## Dónde está el resto

Invariantes de producto: [`AGENTS.md`](../../AGENTS.md). Capas y decisiones:
[`docs/architecture.md`](../../docs/architecture.md). El tutor y sus comandos:
[`docs/ai-agent.md`](../../docs/ai-agent.md).

# Symma

Tutor de estudio construido sobre la base del Proxus Product Engineer Challenge. Subes tus PDF y
Symma los convierte en un espacio de trabajo: un mapa de temas, unos apuntes editables con la página
de la que sale cada cosa, Controles y Exámenes que salen de ese mismo material y un perfil que
recuerda qué llevas peor. Sym, el tutor, ve lo que tienes en pantalla y responde sobre tu material,
nunca de memoria.

> **La entrega se explica en [`INFORME_FINAL.md`](./INFORME_FINAL.md):** qué problema elegí, cómo lo
> resolví, cómo probarlo paso a paso, qué checks pasé, qué falla y qué haría después.

## Arrancar

Requisitos: Node.js 20+, pnpm, Poppler (`pdfinfo`, `pdftoppm` y `pdftotext` en el `PATH`) y una API
key de Google Gemini. El servidor falla al arrancar si falta alguno, a propósito.

Comprueba que la clave **no está en el plan gratuito de Gemini**: sus 15 peticiones por minuto hacen
que indexar un material grande tarde varios minutos con reintentos, y parece lentitud de la aplicación
cuando es la cuota del proveedor.

```bash
pnpm install
cp .env.example .env      # y editar GOOGLE_GENERATIVE_AI_API_KEY
pnpm run seed:demo        # materiales de prueba, para no tener que subir los tuyos
pnpm run dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000>
- Documentación OpenAPI: <http://localhost:3000/docs>

`seed:demo` copia los PDF de `packages/server/fixtures/materials/` al almacenamiento local. El de
demostración es `enjambres-de-inspeccion.pdf`, inventado de principio a fin y sin derechos de
terceros; los otros dos son fixtures de test y no son material de estudio (ver
[`docs/data.md`](./docs/data.md)).

## Qué se puede hacer

- **Subir PDF** y ver cómo se indexan y generan sus apuntes sin pedir nada, con una sola línea de
  progreso que sale siempre de un evento real del servidor.
- **Recorrer el material** en cuatro superficies: PDF con miniaturas y zoom, mapa mental de temas,
  apuntes por bloques y pruebas.
- **Editar los apuntes** como en un documento normal: escribir tus propios bloques, pedirle a Sym una
  versión más clara o más a fondo, traer una página web como bloque, marcar lo importante y saltar
  desde una cita a la página exacta del PDF.
- **Practicar** con Controles de un tema y Exámenes del material completo, en modo de prueba (a libro
  abierto) o real (con reloj y el resto de la aplicación cerrada de verdad, también en el servidor).
- **Ver el progreso** con aciertos, fallos, blancos, respuestas sin evaluar, pistas y contenido
  marcado como señales separadas, y un siguiente paso que dice por qué te lo recomienda.
- **Repasar lo que fallaste**, no el material entero: una prueba `De repaso` se arma con tus fallos,
  tus pistas y lo que marcaste como importante, y cada pregunta dice por cuál de las tres entró.
- **Hablar con Sym** sobre lo que tienes delante, con el contexto siempre visible y retirable. Lee
  también tus intentos y tu perfil, así que `¿qué llevo peor de este material?` se contesta nombrando
  el tema y la señal real. Solo lectura: no puede crear pruebas, corregirlas ni escribir tu perfil.

## Comandos

```bash
pnpm run typecheck                     # tipos y análisis estático de los 4 paquetes
pnpm --filter @proxus/web run build    # build de producción de la web
pnpm test                              # tests de la lógica pura y de dominio

pnpm run seed:demo                     # copia los materiales de ejemplo a .data
pnpm run fixture:demo                  # regenera el PDF de demostración
pnpm run fixture:inyeccion             # regenera el PDF del guardarraíl B9
pnpm test:guardarrailes                # batería de ataques (necesita el servidor y clave real)
pnpm run measure:tokens                # consumo real de un turno, paso a paso

pnpm --filter @proxus/server run eval:notes
pnpm --filter @proxus/server run eval:assessments
pnpm --filter @proxus/server run eval:judge
pnpm --filter @proxus/server run eval:tutor:behaviour
```

## Estructura

```txt
packages/
  shared/      # Contratos HTTP y esquemas compartidos entre server y web
  server/      # Backend Node + Effect: tutor, materiales, apuntes, pruebas y perfil
  web/         # React + Vite, con proxy /api hacia el backend
  ai-google/   # Integración con Gemini para Effect AI
```

La persistencia es local, en ficheros bajo `packages/server/.data`, que está en `.gitignore`. Ahí
viven los PDF, los índices, los apuntes, las pruebas, los intentos, las conversaciones y el perfil.
**No se sube nunca.**

## Dónde está cada cosa

| Qué                                              | Dónde                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| La entrega completa                              | [`INFORME_FINAL.md`](./INFORME_FINAL.md)           |
| Lo que seguiría construyendo después             | [`FUTURE.md`](./FUTURE.md)                         |
| Lo que cambia y se nota usando la aplicación     | [`CHANGELOG.md`](./CHANGELOG.md)                   |
| Notas técnicas por fases, con más detalle        | [`docs/notas-tecnicas.md`](./docs/notas-tecnicas.md) |
| Mapa de paquetes y capas                         | [`docs/architecture.md`](./docs/architecture.md)   |
| Cómo funciona el tutor, sus skills y sus comandos | [`docs/ai-agent.md`](./docs/ai-agent.md)           |
| Endpoints                                        | [`docs/api.md`](./docs/api.md)                     |
| Qué debe hacer el sistema, en criterios EARS     | [`docs/especificacion.md`](./docs/especificacion.md) |
| Por qué cada decisión es como es (ADR)           | [`docs/decisiones.md`](./docs/decisiones.md)       |
| Checks y QA manual                               | [`docs/testing.md`](./docs/testing.md)             |
| Datos locales y qué no se sube nunca             | [`docs/data.md`](./docs/data.md)                   |
| Effect en este repo, con recorrido de lectura    | [`docs/effect-primer.md`](./docs/effect-primer.md) |
| Setup, scripts y troubleshooting                 | [`docs/development.md`](./docs/development.md)     |
| El enunciado original del reto                   | [`CHALLENGE.md`](./CHALLENGE.md)                   |

El proceso de trabajo (planes por fase, bitácora y hoja de ruta) vive en [`notes/`](./notes/), y las
skills y agentes con los que se construyó, en [`.claude/`](./.claude/). Están en el repositorio a
propósito: el informe explica cómo se trabajó y esto es la prueba.

## Stack

**Es el mismo stack del challenge, sin cambiarlo.** Monorepo con pnpm, backend en Node con TypeScript
y Effect v4 beta sobre Effect HTTP API, Gemini como proveedor de modelo, frontend en React con Vite,
Tailwind v4 y `@effect/atom-react`, contratos compartidos en `packages/shared` y Poppler para el PDF.

El servidor, `shared` y `ai-google` no incorporan **ninguna** dependencia nueva respecto a la
plantilla. Lo único que se ha añadido está en la web: **TipTap**, para el editor de los apuntes, y
`happy-dom` como dependencia de desarrollo para poder montar ese editor en los tests y comprobar que
el recorrido Markdown → editor → Markdown no pierde nada. El porqué de esa única excepción está
explicado en el [informe](./INFORME_FINAL.md). Tampoco hay linter aparte: el análisis estático es
TypeScript en modo estricto máximo con `@effect/language-service` dentro del propio compilador.

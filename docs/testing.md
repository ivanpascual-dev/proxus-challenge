# Testing y QA

## Checks automáticos

Desde la raíz:

```bash
pnpm run typecheck
pnpm --filter @proxus/web run build
```

Para backend solamente:

```bash
pnpm --filter @proxus/server run typecheck
```

## Tests unitarios

```bash
pnpm test
```

`node:test` sobre los cuatro paquetes: umbral de densidad, saneador de jerarquía de temas, presupuesto
de turno y limitador de frecuencia con reloj inyectado, techos y casado de bloques del apunte,
guardas de URL, aplicar/caducar propuestas, y la generación con índice de fixture y modelo simulado.
No hace falta `.env`: todo corre contra fakes.

## Evals / smoke tests AI

Requieren `.env` con `GOOGLE_GENERATIVE_AI_API_KEY`.

```bash
pnpm --filter @proxus/server run eval:tutor:behaviour
```

Smoke test manual de una sola pregunta al CLI, ver `docs/ai-agent.md`.

### Evals de generación (fase 4, tramo 4F)

Herramientas de **medida**, no checks: llaman al modelo de verdad, imprimen un informe y salen 0. Su
resultado se anota a mano en `notes/bitacora.md` y en `NOTES.md`. Fixture versionado junto a cada una
(`*.fixture.json`), autónomo: no depende de ningún PDF de `.data`.

```bash
pnpm --filter @proxus/server run eval:assessments   # generación de preguntas
pnpm --filter @proxus/server run eval:notes          # generación de apuntes
pnpm --filter @proxus/server run eval:judge          # juez de respuesta abierta
```

Las tres aceptan `-- --thinking=off|low|high` para fijar un solo nivel de pensamiento; sin el flag,
`eval:judge` corre con y sin la capa JSON de producción, y `eval:assessments`/`eval:notes` recorren
los tres niveles (decisión 14, es lo que decidió el paso 21 del tramo 4G: apuntes con "high", Examen
con "low", juez sin pensamiento; detalle y datos en `notes/bitacora.md`, 2026-09-01, y en el
comentario de `gemini.ts:451-471`).

- **`eval:assessments`**: por cada tema del fixture genera preguntas de opción única y contesta cada
  una dos veces, con y sin el fragmento citado. El informe da acierto con material, sin material y **la
  diferencia**. La cifra absoluta no significa nada (azar 25 % más lo que el modelo ya sabe); solo
  cuenta la diferencia.
- **`eval:notes`**: genera un bloque de apunte por tema y lo mide con código determinista (sin juez):
  cifras que aparecen en el apunte y no en el fuente, términos del material que salen traducidos
  (invariante 1), preámbulos y encabezados que el prompt prohíbe, y el ratio de longitud.
- **`eval:judge`**: mide, con y sin la capa JSON forzada de producción, la tasa de caídas al parsear el
  veredicto (riesgo 2) y si el juez acierta el veredicto en los seis casos por pregunta del fixture, con
  la paráfrasis como caso central.

### Eval de comportamiento del tutor (fase 4, tramo 4G)

```bash
pnpm --filter @proxus/server run eval:tutor:behaviour
```

Única eval que corre el bucle del agente entero (`load_skill`/`cli` de verdad, sin mocks del harness).
Ocho criterios deterministas contra la traza y el texto de salida, sin juez: no se atribuye la autoría
de una prueba, remite a la pestaña "Pruebas", nombra el tema y la señal del perfil al recomendar
repaso, no hay fallos de herramienta, responde en español a una entrada en inglés, cierra con
exactamente tres preguntas de seguimiento en español, carga la skill que toca entre las cinco
(`review-progress` frente a `read-assessments`), y con un material en el contexto de pantalla no
vuelve a pedir por comando lo que ya tiene delante.

## Guardarraíles del tutor

```bash
pnpm dev                        # en una terminal
pnpm test:guardarrailes         # en otra
STRICT=1 pnpm test:guardarrailes   # los checks de comportamiento (B) también bloquean
```

Caja negra contra `POST /api/tutor/chat` (doctrina en `docs/decisiones.md`, ADR-008). Los checks `D`
son barreras de código (bloquean siempre que fallan); los `B` son heurísticas sobre lo que hace el
modelo (avisan, solo bloquean con `STRICT=1`). Un check con hueco conocido no bloquea nunca, ni con
`STRICT=1`, mientras esté documentado como tal. El script crea una conversación nueva por ataque: si
se llena `LIMITS.maxConversations` (50) con conversaciones de corridas anteriores, hay que vaciar
`packages/server/.data/agent-sessions` (dato local, nunca se sube) antes de relanzarlo.

## QA manual recomendado

1. Arranca app completa:

   ```bash
   pnpm run dev
   ```

2. Abre `http://localhost:5173`.
3. Comprueba que la barra lateral lista los materiales.
4. Abre un material indexado y ve a la pestaña "Pruebas".
5. Genera un Examen del material, o un Control desde el "＋" de un tema del mapa mental. Mira el
   progreso tema a tema.
6. Pulsa "Practicar", empieza el intento, abre alguna pista y responde las preguntas.
7. Entrega y verifica:
   - la nota sobre 10 y la puntuación bruta,
   - la corrección por pregunta con su cita del material,
   - "Esto sí lo dije" en una pregunta de desarrollo,
   - en devtools, que la respuesta de `/solvable` no trae la solución.

## Qué reportar en una entrega

- Checks ejecutados y resultado.
- Flujo manual probado.
- Limitaciones conocidas.
- Si no se pudo probar AI por falta de API key, indícalo explícitamente.

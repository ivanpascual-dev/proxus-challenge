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

## Evals / smoke tests AI

Requieren `.env` con `GOOGLE_GENERATIVE_AI_API_KEY`.

```bash
pnpm --filter @proxus/server run eval:tutor:artifact-authoring
pnpm --filter @proxus/server run agent:tutor "Crea un quiz corto de una pregunta sobre variables cualitativas"
```

### Evals de generación (fase 4, tramo 4F)

Herramientas de **medida**, no checks: llaman al modelo de verdad, imprimen un informe y salen 0. Su
resultado se anota a mano en `notes/bitacora.md` y en `NOTES.md`. Fixture versionado junto a cada una
(`*.fixture.json`), autónomo: no depende de ningún PDF de `.data`.

```bash
pnpm --filter @proxus/server run eval:assessments   # generación de preguntas
pnpm --filter @proxus/server run eval:notes          # generación de apuntes
```

Ambas aceptan `-- --thinking=off|low|high` para fijar un solo nivel de pensamiento; sin el flag
recorren los tres (decisión 14, es lo que decide el paso 21 del tramo 4G).

- **`eval:assessments`**: por cada tema del fixture genera preguntas de opción única y contesta cada
  una dos veces, con y sin el fragmento citado. El informe da acierto con material, sin material y **la
  diferencia**. La cifra absoluta no significa nada (azar 25 % más lo que el modelo ya sabe); solo
  cuenta la diferencia.
- **`eval:notes`**: genera un bloque de apunte por tema y lo mide con código determinista (sin juez):
  cifras que aparecen en el apunte y no en el fuente, términos del material que salen traducidos
  (invariante 1), preámbulos y encabezados que el prompt prohíbe, y el ratio de longitud.

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

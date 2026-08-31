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

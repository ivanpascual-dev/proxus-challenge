# Bitácora

Registro fechado de sesiones. **Guarda solo lo que a la sesión siguiente le costaría redescubrir.**

## Qué se anota

- **Desviación:** se hizo distinto de lo que decía el plan, y por qué.
- **Causa raíz:** un fallo que costó encontrar, con el síntoma y lo que resultó ser de verdad.
- **Decisión sobre la marcha:** una elección que no estaba decidida y que ata al proyecto. Si ata de
  verdad, además va como registro a [`docs/decisiones.md`](../docs/decisiones.md): la bitácora guarda
  el contexto, el registro guarda la decisión.
- **Deuda:** lo que queda a medias a propósito, y qué lo desbloquea.

## Qué NO se anota

- Lo que se deduce del `git log` o del diff. Un cambio que salió como el plan decía no es bitácora.
- Lo que se nota usando la aplicación: eso es [`CHANGELOG.md`](../CHANGELOG.md).
- El plan de lo que falta: eso es el plan de la fase, en [`plans/`](plans/).

**Una bitácora que se llena de rutina deja de leerse**, y entonces no sirve para nada. Si una sesión no
trae ninguna de las cuatro cosas de arriba, no se escribe nada ese día.

## Formato

Una entrada por sesión, no por commit. Si ya hay entrada de hoy, se añade una línea debajo.

```markdown
## AAAA-MM-DD · <fase o tema>

- **Desviación:** <qué y por qué>
- **Causa raíz:** <síntoma → lo que era de verdad>
- **Deuda:** <qué queda y qué lo desbloquea>
```

---

## 2026-08-28 · Fase 1 · tramo 1A

- **Desviación:** `@proxus/shared` se añadió como `devDependency` de la raíz (`package.json`) y se corrió
  `pnpm install`. El plan no lo contemplaba. Sin ello, `scripts/test-guardarrailes.mjs` no resolvía
  `@proxus/shared` desde la raíz y caía siempre al respaldo hardcodeado del ADR-007: el punto de control
  del paso 10 validaba cifras fijas, no las de `LIMITS`.
- **Causa raíz:** el campo `error` de `HttpApiEndpoint` quiere un array de esquemas, no un
  `Schema.Union`. Con `Schema.Union([...])` el servidor devolvía 500 en vez de 400/429; se vio probando
  contra el servidor real, no en el typecheck. La forma que funciona es
  `error: [LimitExceeded.pipe(HttpApiSchema.status(400)), RateLimited.pipe(HttpApiSchema.status(429))]`.
- **Desviación:** en `packages/web/src/styles.input.css` el `@import` de Google Fonts va **antes** de
  `@import "tailwindcss"`, al revés que el texto literal de la sección 6.3 del plan. Si no, el
  minificador de Tailwind avisa de `@import` mal situado. Cambio mecánico, sin efecto visual.
- **Desviación:** se añadieron dos tokens fuera de la paleta de la sección 6.3, `--color-success-ink` y
  `--color-danger-ink`. Medido: `--color-success` y `--color-danger` como texto sobre superficie clara
  dan 2.28:1 y 3.76:1, por debajo de AA. F1-24 autoriza ajustar el token cuando falla; se dejaron
  `success`/`danger`/`warning` intactos (bordes e insignias, donde basta 3:1) y se añadieron las
  variantes de texto. El override de tema oscuro reusa el verde/rojo claro que la app ya usaba.
- **Desviación:** se quitó `shadow-slate-950/30` sin sustituto (queda `shadow-2xl` con el negro por
  defecto de Tailwind). Una sombra no debe aclararse en tema claro y ningún token de la paleta encaja
  como color de sombra.
- **Desviación:** el puerto `MaterialRepository.renderPages` (lote) se sustituyó por `renderPage` (una
  página), con el error de página fuera de rango pasando de `MaterialRepositoryError` a comprobación
  por página. La sección 4.5 del plan pedía renderizado incremental para que el presupuesto de turno
  pare entre página y página, pero no tocaba la firma del puerto; sin el cambio de firma no se puede
  parar antes de renderizar el resto.

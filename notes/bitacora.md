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

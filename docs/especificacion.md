# Especificación

El **qué**, sin el **cómo**. Los criterios se escriben en notación EARS: con disparador y con
comportamiento medible. Prohibido lo ambiguo ("rápido", "intuitivo", "mejor"): eso no es un criterio,
es un deseo.

**La prueba de que un criterio está bien escrito:** se puede convertir en un caso de la batería de
evaluación. Si no se puede comprobar, está mal escrito.

**Se rellena por fases**, no de una vez: cada fase añade los criterios de lo que construye, y el agente
`invariantes` los comprueba al cerrarla.

## Chuleta EARS

| Patrón | Fórmula | Cuándo |
| --- | --- | --- |
| Ubicuo | EL sistema DEBERÁ ... | Siempre activo |
| Guiado por evento | CUANDO ... EL sistema DEBERÁ ... | Hay un disparador concreto |
| Guiado por estado | MIENTRAS ... EL sistema DEBERÁ ... | Dura mientras dure un estado |
| No deseado | SI ... ENTONCES EL sistema DEBERÁ ... | Condición de error |
| Opcional | DONDE ... EL sistema DEBERÁ ... | Solo si la característica está |

---

## Lo que aquí NO está, a propósito

**Las invariantes de producto viven en [`AGENTS.md`](../AGENTS.md) y no se copian aquí.** Se cumplen en
todas las fases, así que no pertenecen al apartado de ninguna, y una segunda redacción de la misma regla
es la copia que acaba divergiendo de la primera.

Quien las comprueba es la skill `proxus-verifier`, que las lee de `AGENTS.md` directamente en su puerta
de invariantes. Este documento guarda solo lo que es propio de cada fase.

---

## Criterios por fase

Las fases y su alcance están en [`notes/hoja-de-ruta.md`](../notes/hoja-de-ruta.md). Aquí van solo sus
criterios, que escribe la skill `fase` al planificar cada una.

### Fase 1 · El suelo

_Pendiente._

### Fase 2 · Apuntes: el documento vivo

_Pendiente._

### Fase 3 · El test que enseña

_Pendiente._

### Fase 4 · El agente

_Pendiente._

### Fase 5 · Pulido y prueba

_Pendiente._

---

## Fuera de alcance

Límite duro de lo que se puede construir, tomado de [`CHALLENGE.md`](../CHALLENGE.md) y de las
decisiones tomadas:

- Autenticación y base de datos.
- Frameworks nuevos.
- Cambios cosméticos como aportación principal.
- Herramientas nuevas del agente (ver `docs/decisiones.md`, ADR-004).
- Lo listado en [`extensibilidad.md`](extensibilidad.md), cada cosa con su razón.

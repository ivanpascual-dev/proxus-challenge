# Planes de fase

Un fichero por fase, `faseN-<nombre-corto>.md`, escrito por la skill `fase` **antes** de construir y
consumido por `ejecutar-fase`.

**No se planifican todas las fases el primer día.** Cada plan se escribe con el estado real del repo
delante, y ese estado cambia con la fase anterior. Planificar cinco fases de golpe produce cuatro
planes que hay que tirar.

**El traspaso a la ejecución es un fichero, no una conversación.** Es lo que hace que el plan sobreviva
a que se acabe la sesión, y lo que permite que `@fiel-al-plan` compare después lo construido contra lo
decidido.

Un plan lleva, en este orden: contexto y el dato que gobierna el diseño, decisiones cerradas numeradas,
estado de partida verificado con `fichero:línea`, qué se construye pieza a pieza, qué toca en
`packages/shared`, texto canónico literal si lo hay, orden de ejecución, cómo se sabe que funciona,
fuera de alcance, y riesgos conocidos.

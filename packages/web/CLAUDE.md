# `packages/web`

React con Vite. [`CHALLENGE.md:16`](../../CHALLENGE.md) avisa de que el frontend está deliberadamente
vibecodeado: se puede rehacer, pero **con el mismo criterio que el resto**, no a base de parches.

## Cómo se habla con el servidor

- **El cliente se deriva de la declaración de `packages/shared`.** Nada de `fetch` a mano contra una
  ruta escrita en un string: si el contrato cambia, el typecheck tiene que romperse aquí.
- **Un atom por dominio**, en `domain/<dominio>/atoms.ts`, sobre `apiRuntime.atom` y `apiRuntime.fn`.
  El patrón está en `domain/artifacts/atoms.ts`.
- **Invalidar por etiqueta de reactividad**, no refrescando a mano desde el componente.

## Cosas que ya están y no hay que añadir

- **El markdown ya se renderiza:** `streamdown` está en dependencias y se usa en `ArtifactWorkspace`.
  No hace falta ninguna librería más para encabezados, negritas o listas.
- **El endpoint de listado ya acepta `?kind=`** y `artifactsByKindQuery` ya está escrito en
  `domain/artifacts/atoms.ts`, sin usar por nadie. Separar el panel por tipos es solo frontend.

## Estados de la interfaz

`CHALLENGE.md:40` evalúa "estados de UI" y "manejo de errores" en la misma línea. **Toda vista que
pida datos tiene sus cuatro estados escritos:** cargando, vacío, error y con datos. El estado de error
dice qué pasó y qué se puede hacer, nunca "algo salió mal". Y un fallo del modelo o de la indexación
**se ve**: la invariante 3 de [`AGENTS.md`](../../AGENTS.md) prohíbe tanto el fallo silencioso como el
valor neutro que lo disfraza.

## Colores

Hoy hay colores literales repartidos por los componentes y `color-scheme: dark` clavado en
`styles.input.css`. **Lo que se toque a partir de ahora usa tokens semánticos de `@theme`**, nunca un
`slate-800` suelto. Es Tailwind v4: la configuración vive en el CSS, no en un `tailwind.config.js`.

`styles.generated.css` lo genera un script del paquete y está en `.gitignore`: no se edita a mano.

## Contexto del agente, siempre visible

Si la interfaz va a mandarle al tutor algo que el usuario no ha escrito (lo que tiene abierto, lo que
ha seleccionado, un artefacto elegido), **eso se ve en pantalla antes de enviar y se puede quitar**.
Es la invariante 3 llevada a la interfaz: el agente no usa contexto que la persona no pueda ver ni
retirar.

## Dónde está el resto

Invariantes de producto: [`AGENTS.md`](../../AGENTS.md). Qué se evalúa:
[`CHALLENGE.md`](../../CHALLENGE.md).

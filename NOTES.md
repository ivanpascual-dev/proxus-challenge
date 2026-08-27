# NOTES

> Entrega del reto. Se escribe **sobre la marcha**, al cerrar cada fase, no la noche de antes.
> Un `NOTES.md` escrito al final se escribe mal: se olvidan las razones y quedan los resultados.

---

## 1. El problema que elegí

**Nada está conectado con nada.**

El artefacto no sabe de qué material nació: en las 244 líneas que describen todo el modelo de estudio
no aparece la palabra "material" ni una vez. El intento no vuelve al agente: respondes, sacas nota y
ahí muere. Y la interfaz no está conectada con el chat: la aplicación sabe perfectamente qué estás
mirando y no se lo cuenta al tutor, porque el contrato del chat no tiene dónde ponerlo.

Para el alumno eso se ve en dos cosas. **No puede comprobar nada**: la pregunta salió de un PDF suyo y
no hay forma de volver a la página. Y **el tutor no aprende nada**: responde igual de bien la primera
vez que la décima.

**La tesis, en una frase:** cada pregunta sabe de qué página de tus apuntes salió, y cada respuesta
cambia lo que el tutor te propone después.

**Por qué un problema y no cinco.** Mejorar los tests, dar contexto al agente, rediseñar las notas y
arreglar la experiencia parecen cuatro trabajos distintos. Son cuatro sitios donde falta la misma
conexión. Atacar la conexión arregla los cuatro; atacarlos por separado da cuatro parches que no se
sostienen entre sí. Los hallazgos del recorrido por el código son todos caras del mismo hueco.

---

## 2. Cómo lo resolví

<!-- Se rellena al cerrar cada fase. Una sección por pieza, y cada una responde a tres cosas:
     qué problema resuelve, qué decisión se tomó, y qué se descartó y por qué.
     Los trade-offs van aquí dentro, no en un apartado separado: un trade-off suelto de su decisión
     no se entiende. -->

### Índice del material

_Pendiente: fase 1._

### Citas verificables

_Pendiente: fase 2._

### Perfil de estudio y práctica adaptativa

_Pendiente: fase 3._

### Errores tipados en el transporte

_Pendiente: fase 2._

### Notas por bloques

_Pendiente: fase 4._

---

## 3. Cómo probarlo a mano

<!-- Tiene que poder seguirlo alguien que no ha visto el repo, en orden, sin saltarse nada.
     Material concreto, comando concreto, y qué se tiene que ver en pantalla. -->

**Requisitos:** Node, pnpm, Poppler (`pdfinfo` y `pdftoppm` en el PATH) y `GOOGLE_GENERATIVE_AI_API_KEY`
en `.env`. El servidor falla al arrancar si falta alguno, a propósito.

**Datos de prueba:** `pnpm run seed:demo` copia los materiales de ejemplo versionados en
`packages/server/fixtures/`. No hacen falta apuntes propios para probarlo.

_El recorrido paso a paso se rellena al cerrar cada fase._

---

## 4. Checks ejecutados

```bash
pnpm run typecheck
pnpm --filter @proxus/server run typecheck
pnpm --filter @proxus/web run build
```

_Salida literal al cerrar la entrega._

---

## 5. Comportamiento esperado, fallos conocidos y cómo lo evalúo

<!-- `CHALLENGE.md:72` lo pide explícitamente para cualquier flujo de AI que se toque, y está fuera
     del apartado "Cómo entregar", así que es fácil saltárselo. Aquí va entero. -->

### Comportamiento esperado

_Pendiente. Por flujo tocado: qué tiene que hacer, y qué tiene prohibido hacer._

### Fallos conocidos

_Pendiente. Los reales, no los teóricos. Un apartado de fallos conocidos vacío es un apartado que no
se ha mirado._

### Cómo lo evalúo

_Pendiente: dataset fijo, métricas deterministas, comparación entre ejecuciones, coste y latencia._

---

## 6. Qué haría después con más tiempo

<!-- No es una lista de deseos: es un triaje con razones. Cada línea dice por qué NO está construida,
     y la razón tiene que ser una decisión, no "no me dio tiempo". -->

_Pendiente: el banco de ideas triado._

---

## 7. Cómo trabajé

<!-- El párrafo que enmarca `.claude/` y `notes/plans/`. Sin él, esos ficheros son desorden.
     Con él, son la respuesta al único requisito que el código de producto no puede demostrar. -->

_Pendiente._

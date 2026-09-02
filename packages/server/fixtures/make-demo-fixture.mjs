// Genera packages/server/fixtures/materials/enjambres-de-inspeccion.pdf: un material de demostración
// con contenido inventado y denso, para que cualquiera pueda probar la aplicación entera (indexado,
// mapa mental, apuntes, Controles y Exámenes) sin subir un PDF con derechos de terceros.
//
// No sustituye a densidad.pdf, que es material de calibración: sus cuatro páginas tienen 26, 2.400,
// 200 y 610 caracteres no blancos justo para caer a los dos lados del umbral de 600, y
// `densidad-fixture.test.ts` afirma esa clasificación página a página. Este fichero busca lo
// contrario: que TODAS las páginas pasen el umbral y se indexen por texto, sin coste de renderizado
// ni de visión, y que haya suficientes hechos con respuesta única (cifras, clasificaciones, plazos,
// umbrales) para que un Examen de 30 preguntas tenga de dónde salir.
//
// Sin dependencias nuevas: escribe el PDF a mano, igual que make-fixture.mjs. La diferencia es la
// fuente, que aquí declara /WinAnsiEncoding para que las tildes y las eñes sobrevivan a `pdftotext`.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = join(here, "materials", "enjambres-de-inspeccion.pdf");

// --- Contenido -------------------------------------------------------------
// Disciplina inventada de principio a fin. Cada apartado cierra sobre sí mismo (define sus términos,
// da sus cifras y nombra sus casos), para que un tema del mapa mental sea estudiable por separado.

const doc = [
  { type: "title", text: "Enjambres de Inspección Autónoma" },
  { type: "subtitle", text: "Manual del operador, edición 3 (documento sintético de demostración)" },
  {
    type: "p",
    text:
      "Este manual describe la operación de enjambres de inspección autónoma (EIA) en instalaciones " +
      "industriales cerradas. Todo su contenido es inventado: ni la disciplina, ni las normas que cita, " +
      "ni las cifras que da corresponden a ningún sistema real. Existe para que se pueda probar una " +
      "aplicación de estudio con un documento denso y sin derechos de terceros."
  },

  { type: "h1", text: "1. Fundamentos y vocabulario" },
  {
    type: "p",
    text:
      "Un enjambre de inspección autónoma es un conjunto de entre 6 y 48 unidades móviles que recorren " +
      "una instalación sin operador a los mandos, coordinándose entre ellas para cubrir una superficie " +
      "acordada de antemano. Se distingue de una flota teledirigida en tres propiedades, y las tres " +
      "tienen que darse a la vez: reparto interno del trabajo, tolerancia a la pérdida de unidades y " +
      "cierre de misión sin intervención externa."
  },
  {
    type: "p",
    text:
      "El vocabulario del manual es fijo y conviene no mezclarlo. Se llama nodo a cada unidad móvil. " +
      "Se llama célula al grupo de nodos que comparte una zona y un mismo nodo guía. Se llama malla a " +
      "la red de radio que une a todos los nodos de una misión, y relevo al cambio programado de un " +
      "nodo que agota su carga por otro que estaba en reserva. La superficie que un enjambre se " +
      "compromete a recorrer se llama pliego, y el registro de lo que efectivamente recorrió se llama " +
      "acta de cobertura."
  },
  {
    type: "p",
    text:
      "Un enjambre nunca inspecciona: recorre y registra. La inspección propiamente dicha, es decir el " +
      "juicio sobre si lo registrado indica un defecto, es siempre posterior y humana. Esta separación " +
      "es la razón de que el manual hable de cobertura y no de hallazgos: un enjambre que cubre el " +
      "100% del pliego y no encuentra nada ha hecho su trabajo completo."
  },

  { type: "h1", text: "2. Clasificación por grado de autonomía" },
  {
    type: "p",
    text:
      "Los enjambres se clasifican en tres clases según cuánto pueden decidir sin consultar. La clase " +
      "determina qué instalaciones tienen permitidas y con cuánta supervisión."
  },
  {
    type: "bullets",
    items: [
      "Clase A, autonomía asistida: el enjambre propone el reparto de zonas y espera confirmación " +
        "humana antes de arrancar. Puede operar en cualquier instalación. Requiere un operador presente " +
        "durante toda la misión. Tiempo máximo de misión: 90 minutos.",
      "Clase B, autonomía supervisada: el enjambre reparte zonas y arranca por su cuenta, pero cada " +
        "relevo y cada cambio de pliego se notifica y puede vetarse en los 30 segundos siguientes. " +
        "Prohibida en instalaciones con presencia de personal. Tiempo máximo de misión: 240 minutos.",
      "Clase C, autonomía plena: el enjambre decide reparto, relevos y cierre sin consulta, y solo " +
        "entrega el acta al terminar. Permitida únicamente en instalaciones desalojadas y con " +
        "certificado de aislamiento vigente. Tiempo máximo de misión: 12 horas."
    ]
  },
  {
    type: "p",
    text:
      "La clase no es una propiedad del hardware sino de la configuración de la misión: el mismo " +
      "enjambre puede operar como clase A por la mañana y como clase C por la noche. Bajar de clase " +
      "durante una misión en curso está permitido y es inmediato. Subir de clase durante una misión en " +
      "curso está prohibido sin excepción: obliga a cerrar el acta y abrir una misión nueva."
  },

  { type: "h1", text: "3. Arquitectura de una célula" },
  {
    type: "p",
    text:
      "Toda célula tiene exactamente cuatro roles, y los cuatro tienen que estar cubiertos para que la " +
      "célula se considere operativa. Un nodo desempeña un solo rol a la vez, pero puede cambiar de rol " +
      "entre fases."
  },
  {
    type: "bullets",
    items: [
      "Guía: fija el orden del recorrido y es el único que habla con las otras células. Uno por célula, " +
        "nunca dos.",
      "Testigo: registra. Es el rol que produce el dato que se va a inspeccionar después. Mínimo dos por " +
        "célula, porque un solo testigo deja el registro sin contraste.",
      "Repetidor: mantiene la malla cuando la geometría de la instalación corta la radio. Su número " +
        "depende del pliego, no de la célula: uno por cada tramo sin línea de vista.",
      "Reserva: no recorre. Espera en el punto de relevo con carga completa. Mínimo uno por célula si la " +
        "misión pasa de 60 minutos; ninguno si no los pasa."
    ]
  },
  {
    type: "p",
    text:
      "El tamaño mínimo de una célula operativa es por tanto de cuatro nodos para misiones cortas (un " +
      "guía, dos testigos y un repetidor) y de cinco para misiones de más de 60 minutos. El tamaño " +
      "máximo es de doce: por encima, el guía tarda más en cerrar una ronda de coordinación que lo que " +
      "dura el tramo más corto del recorrido, y la célula se pasa el tiempo esperándose a sí misma."
  },
  {
    type: "p",
    text:
      "Cuando un guía cae, la célula elige guía nuevo por antigüedad de carga: manda el nodo cuya " +
      "batería lleve menos tiempo en uso. No se elige por proximidad ni por rol previo. La razón es que " +
      "un guía se elige para que dure, no para que llegue rápido."
  },

  { type: "h1", text: "4. Ciclo de misión: las cinco fases" },
  {
    type: "p",
    text:
      "Una misión pasa siempre por las mismas cinco fases y siempre en el mismo orden. Saltarse una fase " +
      "invalida el acta de cobertura, aunque el recorrido haya sido correcto."
  },
  {
    type: "bullets",
    items: [
      "Fase 1, reconocimiento: el enjambre recorre el perímetro del pliego sin registrar, para medir la " +
        "geometría real y colocar los repetidores. Duración típica: 8 minutos. No cuenta como cobertura.",
      "Fase 2, reparto: el guía de cada célula recibe su zona y confirma que puede cubrirla con la carga " +
        "que tiene. Una célula que no confirma devuelve su zona al reparto. Duración típica: 2 minutos.",
      "Fase 3, barrido: es el recorrido propiamente dicho. Ocupa entre el 70% y el 85% del tiempo total " +
        "de la misión. Es la única fase en la que se registra.",
      "Fase 4, recosido: el enjambre vuelve sobre los huecos que dejó el barrido, normalmente por " +
        "sombras de radio o por relevos mal encadenados. Si el recosido pasa del 15% del pliego, la " +
        "misión se marca como deficiente aunque acabe cubriendo el 100%.",
      "Fase 5, cierre: se consolida el acta, se firma con la clase de la misión y se descargan los " +
        "registros. Un cierre incompleto deja el acta en estado provisional durante 72 horas, y pasado " +
        "ese plazo la misión se descarta entera."
    ]
  },

  { type: "h1", text: "5. Métricas y umbrales de aceptación" },
  {
    type: "p",
    text:
      "Una misión se acepta o se rechaza contra cuatro números, y basta que uno falle para rechazarla. " +
      "Los umbrales son los mismos para las tres clases: la clase cambia quién puede autorizar una " +
      "excepción, no dónde está el listón."
  },
  {
    type: "bullets",
    items: [
      "Cobertura efectiva: porcentaje del pliego recorrido por al menos un testigo. Umbral de " +
        "aceptación: 92%. Por debajo de 80% la misión no se rechaza, se anula, y no genera acta.",
      "Deriva de posición: distancia entre dónde el nodo cree que está y dónde está. Umbral: 0,4 metros " +
        "de media y 1,2 metros de pico. Se mide contra los balizamientos fijos del perímetro.",
      "Latencia de malla: tiempo que tarda un mensaje del guía en llegar al último nodo de su célula. " +
        "Umbral: 300 milisegundos. Por encima, los relevos se encadenan mal y aparece el recosido.",
      "Reserva al cierre: carga que le queda al enjambre cuando termina. Umbral: 15% de la carga total " +
        "inicial. Terminar por debajo de 15% se registra como incidencia aunque la cobertura sea del 100%."
    ]
  },
  {
    type: "p",
    text:
      "Las cuatro métricas se calculan sobre la misión entera, nunca por célula. Una célula puede bajar " +
      "de 92% de cobertura sin que la misión se rechace, siempre que otra la compense. Esto es " +
      "deliberado: el compromiso se adquiere sobre el pliego, y el pliego es del enjambre, no de la célula."
  },

  { type: "h1", text: "6. Fallos típicos y protocolo de recuperación" },
  {
    type: "p",
    text:
      "Seis fallos concentran la mayoría de las misiones rechazadas. Cada uno tiene un protocolo fijo, y " +
      "el protocolo se aplica sin deliberar: la deliberación es lo que convierte un fallo recuperable en " +
      "una misión perdida."
  },
  {
    type: "bullets",
    items: [
      "Guía mudo: el guía deja de emitir pero sigue moviéndose. Es el más peligroso porque la célula no " +
        "lo detecta como caída. Protocolo: la célula espera dos rondas de coordinación y, si no hay " +
        "respuesta, elige guía nuevo y marca al mudo como obstáculo móvil.",
      "Sombra persistente: un tramo del pliego sin cobertura de radio que el reconocimiento no detectó. " +
        "Protocolo: colocar un repetidor adicional y reintentar el tramo en la fase de recosido, nunca " +
        "en el barrido.",
      "Relevo cruzado: dos nodos de células distintas coinciden en el mismo punto de relevo. Protocolo: " +
        "cede el que tenga menos carga; si están igualados, cede el de identificador mayor.",
      "Deriva acumulada: la posición estimada se degrada a lo largo de la misión sin ningún salto " +
        "brusco. Protocolo: rebalizar contra el perímetro cada 20 minutos. No se corrige con un solo " +
        "rebalizado.",
      "Pliego caliente: la instalación cambia durante la misión (se abre una puerta, se mueve una " +
        "máquina). Protocolo: congelar el reparto, repetir la fase 1 solo en la zona afectada y " +
        "reanudar. El tiempo de la fase 1 repetida no cuenta contra el máximo de la clase.",
      "Cierre huérfano: la misión termina pero ningún nodo consigue entregar el acta. Protocolo: el " +
        "acta queda provisional 72 horas y cualquier nodo del enjambre puede entregarla en ese plazo."
    ]
  },

  { type: "h1", text: "7. Energía, relevos y cálculo de reserva" },
  {
    type: "p",
    text:
      "El consumo de un nodo no es constante: recorrer cuesta aproximadamente el triple que esperar en " +
      "el punto de relevo, y registrar cuesta un 40% más que recorrer sin registrar. Por eso el cálculo " +
      "de reserva se hace sobre tiempo de barrido, no sobre tiempo de misión."
  },
  {
    type: "p",
    text:
      "La regla práctica del manual es la regla del tercio: un nodo no debe entrar en barrido con menos " +
      "de un tercio más de carga de la que su tramo requiere en teoría. Un tramo que en el papel pide " +
      "30 minutos de barrido exige entrar con carga para 40. El tercio cubre la deriva, el recosido " +
      "previsible y el trayecto hasta el punto de relevo, que nunca está donde termina el tramo."
  },
  {
    type: "p",
    text:
      "El número de nodos en reserva se calcula dividiendo la duración prevista del barrido entre la " +
      "autonomía útil de un nodo y redondeando hacia arriba, con un mínimo de uno por célula. Una " +
      "misión de 200 minutos de barrido con nodos de 75 minutos de autonomía útil necesita tres nodos " +
      "en reserva por célula. Redondear hacia abajo es el error más común y produce cierres por debajo " +
      "del 15% de reserva."
  },

  { type: "h1", text: "8. Límites operativos y normativa interna" },
  {
    type: "p",
    text:
      "Los límites siguientes no admiten excepción por parte del operador de turno. Levantarlos requiere " +
      "autorización escrita del responsable de instalación y queda registrado en el acta."
  },
  {
    type: "bullets",
    items: [
      "Ningún enjambre opera con menos de 6 nodos ni con más de 48.",
      "Ninguna misión de clase B o C arranca sin certificado de aislamiento con menos de 24 horas.",
      "Ningún nodo permanece en barrido más de 75 minutos seguidos, aunque le sobre carga.",
      "Ninguna instalación admite dos enjambres simultáneos con pliegos que se solapen más del 10%.",
      "Ningún acta se firma sin las cuatro métricas de la sección 5, aunque las cuatro estén en verde.",
      "Ninguna misión rechazada se repite el mismo día sin cambiar al menos un parámetro del pliego."
    ]
  },
  {
    type: "p",
    text:
      "El incumplimiento de un límite no invalida los datos registrados: invalida el acta. Los registros " +
      "siguen siendo utilizables para una inspección humana, pero la misión no cuenta como cobertura " +
      "declarada de la instalación, que es lo que se audita."
  },

  { type: "h1", text: "9. Cierre, actas y auditoría" },
  {
    type: "p",
    text:
      "El acta de cobertura es el único producto de una misión que sale del enjambre. Contiene el pliego " +
      "comprometido, el recorrido efectivo, las cuatro métricas, la clase con la que se operó, la lista " +
      "de relevos y la lista de incidencias. No contiene juicio alguno sobre lo registrado."
  },
  {
    type: "p",
    text:
      "Un acta es firme cuando la firma el guía de la célula con más cobertura y la contrafirma el " +
      "operador, o, en clase C, cuando pasan 30 minutos sin objeción desde su entrega. Un acta firme no " +
      "se modifica: si aparece un error, se emite un acta correctora que cita a la anterior y explica la " +
      "diferencia. Borrar un acta es imposible por diseño."
  },
  {
    type: "p",
    text:
      "La auditoría anual revisa una de cada veinte actas, elegidas al azar, y comprueba tres cosas: que " +
      "la cobertura declarada se sostiene con los registros, que las incidencias registradas tienen " +
      "protocolo aplicado y que ningún límite de la sección 8 se levantó sin autorización escrita. Una " +
      "sola acta que falle los tres puntos obliga a auditar la totalidad del año."
  },

  { type: "h1", text: "10. Glosario" },
  {
    type: "bullets",
    items: [
      "Acta de cobertura: registro de lo que un enjambre recorrió efectivamente, con sus métricas.",
      "Barrido: fase 3, la única en la que se registra.",
      "Célula: grupo de nodos con una zona y un guía comunes.",
      "Cobertura efectiva: porcentaje del pliego recorrido por al menos un testigo.",
      "Deriva: distancia entre la posición estimada de un nodo y la real.",
      "Malla: red de radio que une a los nodos de una misión.",
      "Nodo: cada unidad móvil del enjambre.",
      "Pliego: superficie que el enjambre se compromete a recorrer.",
      "Recosido: fase 4, vuelta sobre los huecos que dejó el barrido.",
      "Relevo: cambio programado de un nodo agotado por uno en reserva.",
      "Regla del tercio: entrar en barrido con un tercio más de carga de la teórica.",
      "Sombra: tramo del pliego sin cobertura de radio."
    ]
  }
];

// --- Maquetación -----------------------------------------------------------
// Ancho útil 499pt (595 menos 48 de margen a cada lado). Helvetica a 10pt mide de media unos 5pt por
// carácter, así que 95 caracteres por línea entran con holgura y el texto no se sale de la caja.

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const TOP = PAGE_HEIGHT - 64;
const BOTTOM = 60;

const STYLES = {
  title: { font: "F2", size: 22, leading: 28, cpl: 42, before: 0, after: 12 },
  subtitle: { font: "F1", size: 12, leading: 16, cpl: 80, before: 0, after: 22 },
  h1: { font: "F2", size: 15, leading: 20, cpl: 62, before: 18, after: 10 },
  p: { font: "F1", size: 11, leading: 16, cpl: 86, before: 0, after: 12 },
  bullet: { font: "F1", size: 11, leading: 16, cpl: 82, before: 0, after: 8 }
};

const wrap = (text, charsPerLine) => {
  const lines = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= charsPerLine) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") { lines.push(current); }
  return lines;
};

// Cada elemento maquetado es una línea con su posición absoluta ya resuelta.
const pages = [];
let currentPage = [];
let y = TOP;

const newPage = () => {
  if (currentPage.length > 0) { pages.push(currentPage); }
  currentPage = [];
  y = TOP;
};

const emit = (lines, style, indent = 0) => {
  // Un bloque que no entra entero en lo que queda de página empieza en la siguiente, salvo que ni
  // siquiera quepa en una página vacía. Evita títulos huérfanos al pie.
  const height = style.before + lines.length * style.leading + style.after;
  if (y - height < BOTTOM && height < TOP - BOTTOM) { newPage(); }
  y -= style.before;
  for (const line of lines) {
    if (y < BOTTOM) { newPage(); }
    currentPage.push({ x: MARGIN + indent, y, font: style.font, size: style.size, text: line });
    y -= style.leading;
  }
  y -= style.after;
};

for (const block of doc) {
  if (block.type === "bullets") {
    for (const item of block.items) {
      const lines = wrap(item, STYLES.bullet.cpl);
      // El PDF se escribe en latin1 y la fuente declara /WinAnsiEncoding, donde el bullet vive en
      // 0x95. Poner el U+2022 de siempre lo truncaría a 0x22 y `pdftotext` devolvería comillas.
      emit([` ${lines[0]}`, ...lines.slice(1).map((l) => `  ${l}`)], STYLES.bullet, 8);
    }
    y -= 6;
    continue;
  }
  const style = STYLES[block.type];
  emit(wrap(block.text, style.cpl), style);
}
newPage();

// --- PDF a mano ------------------------------------------------------------
// Orden de objetos:
//   1            Helvetica
//   2            Helvetica-Bold
//   3..(2+N)     flujos de contenido
//   (3+N)..      objetos de página
//   penúltimo    Pages
//   último       Catalog

const escapePdf = (text) => text.replace(/[\\()]/g, (c) => `\\${c}`);

const contentStream = (lines) =>
  lines
    .map((l) => `BT /${l.font} ${l.size} Tf ${l.x} ${l.y.toFixed(1)} Td (${escapePdf(l.text)}) Tj ET`)
    .join("\n");

const pageCount = pages.length;
const CONTENT_START = 3;
const PAGE_START = CONTENT_START + pageCount;
const PAGES_OBJ = PAGE_START + pageCount;
const CATALOG = PAGES_OBJ + 1;

const objects = [];
objects[1] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
objects[2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

pages.forEach((lines, i) => {
  const stream = contentStream(lines);
  objects[CONTENT_START + i] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  objects[PAGE_START + i] =
    `<< /Type /Page /Parent ${PAGES_OBJ} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]` +
    ` /Resources << /Font << /F1 1 0 R /F2 2 0 R >> >> /Contents ${CONTENT_START + i} 0 R >>`;
});

const kids = pages.map((_, i) => `${PAGE_START + i} 0 R`).join(" ");
objects[PAGES_OBJ] = `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`;
objects[CATALOG] = `<< /Type /Catalog /Pages ${PAGES_OBJ} 0 R >>`;

let pdf = "%PDF-1.4\n";
const offsets = [];
for (let n = 1; n <= CATALOG; n++) {
  offsets[n] = Buffer.byteLength(pdf, "latin1");
  pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
}

const xrefOffset = Buffer.byteLength(pdf, "latin1");
pdf += `xref\n0 ${CATALOG + 1}\n0000000000 65535 f \n`;
for (let n = 1; n <= CATALOG; n++) {
  pdf += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${CATALOG + 1} /Root ${CATALOG} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.from(pdf, "latin1"));

console.log(`Escrito ${outputPath} (${pageCount} páginas)`);

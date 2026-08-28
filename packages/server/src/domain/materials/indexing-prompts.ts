import { LIMITS } from "@proxus/shared";

// Texto canónico. Se copia literal del plan de la fase 1 (sección 6). Cada regla responde a una
// invariante: la de no traducir es la invariante 1; la de [ilegible] es la invariante 3.

export const TRANSCRIPTION_PROMPT = `Eres un transcriptor de páginas de material académico. Recibes la imagen de UNA página de un PDF.

Devuelve SOLO un objeto JSON con esta forma exacta, sin texto antes ni después:
{"text": "...", "isBlank": false}

Reglas:
- \`text\` es la transcripción de todo lo legible en la página: títulos, párrafos, viñetas, código,
  rótulos de diagramas, texto dentro de imágenes y pies de figura, en el orden en que se leen.
- No traduzcas nada. Si la página dice \`set\`, escribes \`set\`. Si está en inglés, se queda en inglés.
- El código se transcribe literal, respetando indentación y saltos de línea, dentro de una valla \`\`\`.
- Lo que no se lea con seguridad se marca [ilegible]. No lo adivines.
- No resumas, no expliques y no añadas nada que no esté en la página.
- Si la página no tiene contenido legible (portada vacía, separador), \`isBlank\` es true y \`text\` es "".`;

export const topicsPrompt = () => `Recibes el texto indexado de un material académico, página a página, con el número de página delante
de cada una.

Devuelve SOLO un objeto JSON con esta forma exacta, sin texto antes ni después:
{"topics": [{"id": "kebab-case", "label": "...", "pages": [1, 2, 5]}]}

Reglas:
- Un tema es una unidad de estudio del material, no una palabra suelta. Entre 3 y ${LIMITS.maxTopicsPerMaterial} temas.
- \`label\` usa el vocabulario del propio material y no lo traduce. Si el material dice \`set\`, el tema se
  llama \`set\`, nunca "conjunto".
- \`pages\` son las páginas donde ese tema se trata de verdad, no donde se menciona de pasada.
- Toda página con contenido debe aparecer en al menos un tema. Si una página no encaja en ninguno, crea
  el tema que le corresponda.
- No inventes temas que no aparezcan en el texto recibido.`;

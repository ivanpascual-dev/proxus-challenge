import { LIMITS } from "@proxus/shared";

// Texto canónico. Traducido al inglés en la fase 4 (decisión 9, tramo 4G, paso 20): regla por regla,
// en el mismo orden. Se copia literal del plan de la fase 1 (sección 6). Cada regla responde a una
// invariante: la de no traducir es la invariante 1; la de [ilegible] es la invariante 3.
// `topicsPrompt` se amplió sobre la marcha para pedir una jerarquía de dos niveles (ADR-012); el
// plan §6.2 y la bitácora del 2026-08-28 recogen el porqué.
//
// Incidencia de traducción (plan de fase 4, §6.3): estos dos prompts NO llevan la línea canónica
// "Write the output in Spanish", a diferencia de los otros cuatro. Su propia regla de no-traducción
// dice lo contrario ("si la página/el material está en inglés, se queda en inglés"): la salida sigue
// el idioma del material, nunca se fuerza a español. Añadir la línea sería contradecir la regla en el
// mismo prompt. Anotado, no preguntado todavía a Iván: revisar en el cierre del tramo 4G.

export const TRANSCRIPTION_PROMPT = `You are a transcriber of academic material pages. You receive the image of ONE page of a PDF.

Return ONLY a JSON object with this exact shape, no text before or after:
{"text": "...", "isBlank": false}

Rules:
- \`text\` is the transcription of everything legible on the page: titles, paragraphs, bullet points,
  code, diagram labels, text inside images and figure captions, in the order they are read.
- Do not translate anything. If the page says \`set\`, you write \`set\`. If it is in English, it stays
  in English.
- Code is transcribed literally, respecting indentation and line breaks, inside a \`\`\` fence.
- What cannot be read with certainty is marked [ilegible]. Do not guess it.
- Do not summarize, do not explain and do not add anything that is not on the page.
- If the page has no legible content (empty cover, separator), \`isBlank\` is true and \`text\` is "".`;

export const topicsPrompt = () => `You receive the indexed text of an academic material, page by page, with the page number in front of
each one.

Return ONLY a JSON object with this exact shape, no text before or after:
{"topics": [{"id": "kebab-case", "label": "...", "pages": [1, 2, 5], "parent": null}]}

Rules:
- A topic is a unit of study of the material, not a stray word. Between 3 and ${LIMITS.maxTopicsPerMaterial} topics in total.
- \`label\` uses the material's own vocabulary and does not translate it. If the material says \`set\`,
  the topic is called \`set\`, never "conjunto".
- \`pages\` are the pages where that topic is actually covered, not where it is mentioned in passing.
- Every page with content must appear in at least one topic. If a page does not fit any, create the
  topic it belongs to.
- Organize the topics into a hierarchy of at most two levels: a few general topics (the material's
  areas) and, hanging from them, their specific subtopics. \`parent\` is the \`id\` of another topic in
  this same list, or null if the topic is top-level.
- Between 2 and 6 top-level topics.
- A subtopic covers an aspect of its parent topic, not something different. If in doubt, make it a
  top-level topic.
- Do not invent topics or relationships that do not appear in the received text.`;

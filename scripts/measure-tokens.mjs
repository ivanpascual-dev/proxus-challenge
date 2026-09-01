#!/usr/bin/env node
// Guion de medición de tokens (fase 4, tramo 4A, docs/../notes/plans/fase4-el-agente.md §4.2 y §7).
//
// Corre un turno real: reconstruye, paso a paso, las llamadas que el bucle de agente de
// `session.ts` habría mandado a Gemini para un turno ya grabado en
// `packages/server/.data/agent-sessions/`, y llama a la API REAL para leer sus tokens de entrada,
// cacheados y de salida. No pasa por el servidor HTTP ni por gemini.ts: es una sonda aparte,
// deliberadamente separada del adaptador, porque hasta que gemini.ts decodifica `usageMetadata`
// (este mismo tramo) el sistema no tiene forma de devolver esos números. La comprobación de que
// gemini.ts los decodifica bien vive en `gemini.test.ts` (rápida, sin red); este guion mide lo caro:
// el turno real contra la API real.
//
// Reconstruye (duplicados a propósito, ver arriba): el prompt de sistema y las skills de
// `academic-tutor.ts`/`harness.ts` en la fecha de este tramo (cambia en el tramo 4E, hay que
// actualizar las constantes de aquí si se corre después), las dos herramientas del arnés
// (`load_skill`, `cli`) tal cual las declara el switch de `gemini.ts`, y el renderizado de mensajes
// de `session.ts` (imágenes de página como `inlineData`, tool-result como texto).
//
// Uso:
//   pnpm measure:tokens [fichero-de-sesión] [índice-de-turno]
//   pnpm measure:tokens                              -> verifier-f105b-1787938697.json, último turno
//
// Hace llamadas reales a la API de Gemini: tiene coste y tarda. Requiere
// GOOGLE_GENERATIVE_AI_API_KEY (se carga de .env con --env-file, como el resto del repo).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sessionsDir = join(root, "packages", "server", ".data", "agent-sessions");

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_SESSION_HINT = "verifier-f105b";

// --- Texto canónico duplicado de harness.ts / academic-tutor.ts / gemini.ts, tal cual hoy -----

const AGENT_NAME = `You are an academic tutor agent.

You help students understand academic material, especially their uploaded PDF materials.
Be precise, pedagogical, and honest about what you can infer from the available materials.`;

const SKILLS = [
  {
    name: "use-uploaded-materials",
    description: "Use uploaded PDF materials: read their indexed text, render page ranges as images, or read the study note (its blocks, the material's mind map) before answering material-specific questions."
  },
  {
    name: "use-study-assessments",
    description: "Read the student's study assessments (Controles and Exámenes), their attempts, and their study profile, to talk about how they are doing and what to review. You cannot create assessments or answer them."
  },
  {
    name: "propose-note-changes",
    description: "Propose adding, rewriting, or removing a block in a student's study notes for a material."
  }
];

const skillsHelp = SKILLS.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");

const SYSTEM_PROMPT = `${AGENT_NAME}

You have access to a CLI tool. Use --help when you need command usage, subcommands, or examples.

Available skills:
${skillsHelp}

You initially only know skill names and short descriptions.
Skills are not tools and their names are not callable functions.
When a task matches a skill description, call the load_skill tool with the skill name, for example { "name": "use-uploaded-materials" }.
Skill text may describe workflows, conventions, examples, or tools available elsewhere in the harness.`;

// gemini.ts:125-155, el switch a mano que traduce cada herramienta. Duplicado literal.
const TOOL_DECLARATIONS = [
  {
    name: "load_skill",
    description: "Load the full instructions for a listed skill by name.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name to load" } },
      required: ["name"]
    }
  },
  {
    name: "cli",
    description: "Run a CLI command. Use --help on commands to inspect usage, subcommands, and examples.",
    parameters: {
      type: "object",
      properties: { input: { type: "string", description: "Command input string described by a loaded skill" } },
      required: ["input"]
    }
  }
];

// --- Carga de una sesión real grabada en disco -------------------------------------------------

function resolveSessionFile(hint) {
  const files = readdirSync(sessionsDir).filter((name) => name.endsWith(".json"));
  const exact = files.find((name) => name === hint || name === `${hint}.json`);
  if (exact !== undefined) return exact;
  const partial = files.find((name) => name.includes(hint));
  if (partial !== undefined) return partial;
  throw new Error(`Ninguna sesión coincide con "${hint}" en ${sessionsDir}. Disponibles: ${files.join(", ")}`);
}

function loadMessages(fileName) {
  const raw = readFileSync(join(sessionsDir, fileName), "utf8");
  const data = JSON.parse(raw);
  const messages = data.messages ?? data;
  if (!Array.isArray(messages)) throw new Error(`${fileName} no tiene un array "messages"`);
  return { raw, messages };
}

// Un turno es [user, (tool-call, tool-result)*, assistant]. Una sesión puede tener varios turnos
// seguidos; se parte por cada mensaje "user".
function splitTurns(messages) {
  const turns = [];
  let current = [];
  for (const message of messages) {
    if (message.role === "user" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

// Los prefijos que `session.ts:execute()` habría mandado a Gemini, uno por paso del bucle de
// agente: el primero solo ve el user; cada paso siguiente ve un par (tool-call, tool-result) más;
// el último (con el assistant ya en la sesión grabada, pero sin incluirlo en lo que se manda) es la
// llamada que cerró el turno con texto en vez de una llamada a herramienta.
function stepPrefixes(turnMessages) {
  const withoutFinalAssistant = turnMessages.at(-1)?.role === "assistant"
    ? turnMessages.slice(0, -1)
    : turnMessages;
  const prefixes = [];
  for (let end = 1; end <= withoutFinalAssistant.length; end += 2) {
    prefixes.push(withoutFinalAssistant.slice(0, end));
  }
  return prefixes;
}

// --- session.ts:renderMessage + gemini.ts:messageParts, combinados en un único paso -------------

const isMaterialPageImages = (value) =>
  typeof value === "object" && value !== null
  && value.type === "material-page-images"
  && Array.isArray(value.pages);

const base64Of = (data) => {
  const match = /^data:[^;]+;base64,(.*)$/s.exec(data);
  return match?.[1] ?? data;
};

const formatToolResult = (result) => {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
};

function toGeminiContent(message) {
  switch (message.role) {
    case "user":
      return { role: "user", parts: [{ text: message.content }] };
    case "assistant":
      return { role: "model", parts: [{ text: message.content }] };
    case "tool-call":
      return { role: "model", parts: [{ text: `Tool call ${message.name}: ${JSON.stringify(message.input)}` }] };
    case "tool-result": {
      if (!message.isFailure && isMaterialPageImages(message.result)) {
        const result = message.result;
        const notice = result.notice === undefined ? "" : ` ${result.notice}`;
        return {
          role: "user",
          parts: [
            { text: `Tool result ${message.name}: rendered pages ${result.pages.map((page) => page.page).join(", ")} from ${result.material.title}.${notice}` },
            ...result.pages.map((page) => ({ inlineData: { mimeType: page.mediaType, data: base64Of(page.data) } }))
          ]
        };
      }
      return {
        role: "user",
        parts: [{ text: `Tool result ${message.name}${message.isFailure ? " failure" : ""}: ${formatToolResult(message.result)}` }]
      };
    }
    default:
      throw new Error(`Rol desconocido: ${message.role}`);
  }
}

// --- La llamada real a Gemini --------------------------------------------------------------------

function requireApiKey() {
  const key = (process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "").trim();
  if (key.length === 0) {
    throw new Error("Falta GOOGLE_GENERATIVE_AI_API_KEY. Corre con: node --env-file=.env --import tsx scripts/measure-tokens.mjs");
  }
  return key;
}

async function callGemini({ apiKey, model, contents }) {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
  };
  const bodyText = JSON.stringify(body);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: bodyText,
    signal: AbortSignal.timeout(60_000)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini respondió ${response.status}: ${text.slice(0, 500)}`);
  }
  const json = JSON.parse(text);
  return { usageMetadata: json.usageMetadata, requestBytes: bodyText.length };
}

// --- Programa principal ---------------------------------------------------------------------------

function fmt(n) {
  return n === undefined ? "-" : n.toLocaleString("es-ES");
}

async function main() {
  const apiKey = requireApiKey();
  const model = (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_MODEL;

  const [sessionArg, turnArg] = process.argv.slice(2);
  const sessionFile = resolveSessionFile(sessionArg ?? DEFAULT_SESSION_HINT);
  const { raw, messages } = loadMessages(sessionFile);
  const turns = splitTurns(messages);
  const turnIndex = turnArg !== undefined ? Number(turnArg) : turns.length - 1;
  const turn = turns[turnIndex];
  if (turn === undefined) {
    throw new Error(`La sesión tiene ${turns.length} turno(s); pedido índice ${turnIndex}`);
  }

  console.log(`Sesión: ${sessionFile} (${(raw.length / 1_000_000).toFixed(2)} MB en disco)`);
  console.log(`Modelo: ${model}`);
  console.log(`Turno ${turnIndex} de ${turns.length}, ${turn.length} mensajes`);
  console.log("");

  const prefixes = stepPrefixes(turn);
  console.log(`${prefixes.length} llamada(s) de agente para este turno.\n`);

  const rows = [];
  for (let step = 0; step < prefixes.length; step++) {
    const contents = prefixes[step].map(toGeminiContent);
    const result = await callGemini({ apiKey, model, contents });
    const usage = result.usageMetadata ?? {};
    rows.push({ step, ...usage, requestBytes: result.requestBytes });
    console.log(
      `paso ${step}: entrada=${fmt(usage.promptTokenCount)} cacheados=${fmt(usage.cachedContentTokenCount)} `
      + `salida=${fmt(usage.candidatesTokenCount)} total=${fmt(usage.totalTokenCount)} `
      + `(${(result.requestBytes / 1_000_000).toFixed(2)} MB en la petición)`
    );
  }

  const sum = (key) => rows.reduce((acc, row) => acc + (row[key] ?? 0), 0);
  const totalBytes = rows.reduce((acc, row) => acc + row.requestBytes, 0);

  console.log("");
  console.log("--- Totales del turno (suma de las llamadas del bucle de agente) ---");
  console.log(`Tokens de entrada:   ${fmt(sum("promptTokenCount"))}`);
  console.log(`Tokens cacheados:    ${fmt(sum("cachedContentTokenCount"))}`);
  console.log(`Tokens de salida:    ${fmt(sum("candidatesTokenCount"))}`);
  console.log(`Bytes de petición:   ${(totalBytes / 1_000_000).toFixed(2)} MB`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

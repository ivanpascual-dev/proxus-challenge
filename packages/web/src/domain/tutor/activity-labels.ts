// Fase 5, §4.4 y §6.3: "los nombres load_skill y cli solo aparecen en detalle técnico. Los labels
// humanos salen de una tabla exhaustiva por tipo de actividad, con fallback 'Ejecutando una acción'."
// La tabla se corresponde con los comandos reales que declara el harness del servidor
// (`packages/server/src/domain/agents/academic-tutor/*-commands.ts` y `skills/*.ts`): si se añade un
// comando nuevo ahí, se añade aquí también, o cae al fallback en vez de romper.

const SKILL_LABELS: Readonly<Record<string, string>> = {
  "use-uploaded-materials": "Consultando el material",
  "use-study-notes": "Consultando los apuntes",
  "review-progress": "Revisando tu progreso",
  "propose-note-changes": "Preparando cambios en el apunte",
  "read-assessments": "Consultando las pruebas"
};

// Ordenado del prefijo más específico al más genérico dentro de cada grupo, para que
// `artifacts note propose` no case antes por error contra un prefijo `artifacts` más corto.
const CLI_PREFIX_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["materials list", "Listando tus materiales"],
  ["materials view", "Viendo páginas del material"],
  ["materials read", "Leyendo el material"],
  ["artifacts note propose", "Preparando una propuesta de apunte"],
  ["artifacts attempts", "Consultando el historial de intentos"],
  ["artifacts block", "Consultando un bloque del apunte"],
  ["artifacts show", "Consultando una prueba"],
  ["artifacts list", "Listando tus apuntes y pruebas"],
  ["profile show", "Consultando tu progreso"]
];

const FALLBACK_LABEL = "Ejecutando una acción";

const skillNameFromInput = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null || !("name" in input)) {
    return undefined;
  }
  const name = (input as { readonly name: unknown }).name;
  return typeof name === "string" ? name : undefined;
};

const cliCommandFromInput = (input: unknown): string | undefined => {
  if (typeof input !== "object" || input === null || !("input" in input)) {
    return undefined;
  }
  const raw = (input as { readonly input: unknown }).input;
  return typeof raw === "string" ? raw.trim() : undefined;
};

// Etiqueta humana de una llamada concreta, para la lista abierta de `AgentActivity`.
export const describeActivityCall = (name: string, input: unknown): string => {
  if (name === "load_skill") {
    const skillName = skillNameFromInput(input);
    return (skillName !== undefined ? SKILL_LABELS[skillName] : undefined) ?? FALLBACK_LABEL;
  }

  if (name === "cli") {
    const command = cliCommandFromInput(input);
    if (command !== undefined) {
      const match = CLI_PREFIX_LABELS.find(([prefix]) => command.startsWith(prefix));
      if (match !== undefined) {
        return match[1];
      }
    }
    return FALLBACK_LABEL;
  }

  return FALLBACK_LABEL;
};

// El verbo del resumen cerrado (decisión 23, §4.4: "verbo, contador y estado"). Solo tres frases
// posibles: hubo llamadas a herramientas, no hizo falta ninguna, o el turno falló.
export const turnActivityVerb = (params: { readonly callCount: number; readonly failed: boolean }): string => {
  if (params.failed) {
    return "No se pudo completar una acción";
  }
  return params.callCount > 0 ? "Consultando el material" : "Preparando una respuesta";
};

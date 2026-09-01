// Layout puro del escritorio (fase 5, §4.1). Nada aquí toca el DOM ni localStorage: `AppShell` decide
// cuándo llamar a cada función y qué hacer con el resultado. `mode` nunca se persiste (decisión 9: solo
// se guarda la proporción); lo decide siempre el llamador a partir de si hay material seleccionado y
// de si el viewport admite los dos mínimos, así que aquí siempre viaja como "chat" hasta que quien
// llama lo recalcula.

export type WorkspaceMode = "chat" | "split";

export interface WorkspaceLayout {
  readonly mode: WorkspaceMode;
  readonly materialRatio: number;
}

export interface SplitBounds {
  readonly availableWidth: number;
  readonly minMaterialWidth: number;
  readonly minChatWidth: number;
}

export const DEFAULT_MATERIAL_RATIO = 0.58;

// Acota una proporción a lo que el viewport puede sostener. Si ni siquiera cabe el mínimo de los dos
// paneles (`minRatio > maxRatio`), no hay una proporción válida que ofrecer: se acota solo a [0, 1]
// para no devolver algo fuera de rango, y es responsabilidad de quien llama decidir el modo `chat` en
// ese caso en vez de `split`.
export const clampMaterialRatio = (ratio: number, bounds: SplitBounds): number => {
  const { availableWidth, minMaterialWidth, minChatWidth } = bounds;
  const safeRatio = Number.isFinite(ratio) ? ratio : DEFAULT_MATERIAL_RATIO;
  if (availableWidth <= 0) {
    return DEFAULT_MATERIAL_RATIO;
  }
  const minRatio = minMaterialWidth / availableWidth;
  const maxRatio = 1 - minChatWidth / availableWidth;
  if (minRatio > maxRatio) {
    return Math.min(Math.max(safeRatio, 0), 1);
  }
  return Math.min(Math.max(safeRatio, minRatio), maxRatio);
};

// Traduce la posición del puntero durante el arrastre a una proporción, ya acotada a los mínimos.
export const ratioFromPointer = (clientX: number, contentLeft: number, bounds: SplitBounds): number => {
  if (bounds.availableWidth <= 0) {
    return DEFAULT_MATERIAL_RATIO;
  }
  const raw = (clientX - contentLeft) / bounds.availableWidth;
  return clampMaterialRatio(raw, bounds);
};

// Un valor ausente, no-JSON o sin `materialRatio` numérico cae al valor aprobado: la interfaz sigue
// funcionando aunque `localStorage` esté corrupto, bloqueado o no exista (riesgo conocido del plan).
export const decodeStoredLayout = (value: string | null): WorkspaceLayout => {
  if (value === null) {
    return { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO };
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "materialRatio" in parsed &&
      typeof (parsed as { readonly materialRatio: unknown }).materialRatio === "number" &&
      Number.isFinite((parsed as { readonly materialRatio: number }).materialRatio)
    ) {
      const ratio = (parsed as { readonly materialRatio: number }).materialRatio;
      return { mode: "chat", materialRatio: Math.min(Math.max(ratio, 0), 1) };
    }
  } catch {
    // el valor no era JSON
  }
  return { mode: "chat", materialRatio: DEFAULT_MATERIAL_RATIO };
};

// Solo la proporción se guarda (decisión 9): nunca contexto, perfil ni contenido educativo.
export const encodeLayoutForStorage = (layout: WorkspaceLayout): string =>
  JSON.stringify({ materialRatio: layout.materialRatio });

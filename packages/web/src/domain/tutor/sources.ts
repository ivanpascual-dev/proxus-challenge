// Fase 5, §5.3: cómo se lee una fuente consultada. El servidor manda las páginas que sirvió de verdad,
// ordenadas; aquí solo se decide cómo se escriben. Un turno que lee 12 páginas seguidas no puede
// ocupar tres líneas con una lista de números, pero tampoco se recorta en silencio: los tramos
// contiguos se agrupan y se enseñan todos.

export const pageRanges = (pages: readonly number[]): readonly string[] => {
  const ordered = [...new Set(pages)].sort((a, b) => a - b);
  const ranges: string[] = [];

  let start: number | null = null;
  let previous: number | null = null;

  const flush = () => {
    if (start === null || previous === null) {
      return;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  };

  for (const page of ordered) {
    if (start === null || previous === null) {
      start = page;
      previous = page;
      continue;
    }
    if (page === previous + 1) {
      previous = page;
      continue;
    }
    flush();
    start = page;
    previous = page;
  }
  flush();

  return ranges;
};

// El texto del botón de una fuente: singular y plural de verdad, y los tramos ya agrupados.
export const formatSourcePages = (pages: readonly number[]): string => {
  const ranges = pageRanges(pages);
  if (ranges.length === 0) {
    return "";
  }
  const isSinglePage = ranges.length === 1 && !ranges[0]!.includes("-");
  return `${isSinglePage ? "página" : "páginas"} ${ranges.join(", ")}`;
};

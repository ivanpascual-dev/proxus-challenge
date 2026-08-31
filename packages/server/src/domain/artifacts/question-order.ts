// El reparto por tipo lo decide el código y es determinista (ADR-018): dos generaciones del mismo
// alcance dan las mismas cuentas por tipo. El ORDEN en que se presentan las preguntas ya montadas es
// otra cosa. Si salieran en el orden del reparto, el alumno vería toda una tanda de opción única,
// luego toda la de verdadero/falso: la prueba dejaría de parecerse a un examen y regalaría el tipo de
// cada pregunta por su posición.
//
// Se barajan con una permutación de Fisher-Yates sembrada por el identificador de la prueba. El id ya
// vive en el JSON guardado, así que dos lecturas de la misma prueba dan el mismo orden, pero el tipo
// deja de marcar la posición. No entra `Math.random()`: el orden es reproducible a partir de lo que
// se guarda.

const seedFrom = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Permutación estable de `items`: misma semilla, mismo orden. La salida es siempre el mismo multiset
// que la entrada.
export const shuffleBySeed = <A>(items: readonly A[], seed: string): A[] => {
  const out = [...items];
  const next = mulberry32(seedFrom(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
};

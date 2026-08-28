import { createHash } from "node:crypto";

// La huella del contenido de un PDF (ADR-011). El índice se archiva por esta huella: o hay un índice
// para este contenido exacto, o hay que construirlo. No existe el estado "índice caducado".
// Medido el 2026-08-28: sha256 sobre los 19,6 MB del corpus tarda 10-50 ms, y detecta cambios que
// contar caracteres no ve (una imagen sustituida, páginas reordenadas).
export const hashContent = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

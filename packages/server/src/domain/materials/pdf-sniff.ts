// La asunción A1 del plan de fase 4: el `contentType` que manda el navegador no se cree. Esto es el
// primer filtro, barato, sobre los bytes reales; `pdfinfo` es el segundo y tumba lo que pase este
// sniff sin ser un PDF de verdad (un `.txt` que empieza por "%PDF-", por ejemplo).
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const; // "%PDF-"

export const looksLikePdf = (bytes: Uint8Array): boolean =>
  bytes.length >= PDF_MAGIC.length && PDF_MAGIC.every((byte, index) => bytes[index] === byte);

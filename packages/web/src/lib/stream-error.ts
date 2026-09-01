// Una respuesta de error de una ruta con progreso (NDJSON): el cuerpo puede ser JSON del contrato
// (`{ _tag, message, ... }`), una página de error o un volcado del servidor. Ya no decide qué texto
// ve el alumno (fase 5, §4.2): solo reconstruye la causa para que `toUserNotice`
// (`user-feedback.ts`) decida. Si el cuerpo trae un `_tag` de error de dominio reconocido, se
// devuelve tal cual y su `message` (redactado a mano en el servidor) se podrá mostrar. Cualquier otro
// cuerpo, JSON o no, se descarta entero: la operación cae al copy de respaldo, nunca a una frase
// arbitraria del servidor.
export async function errorFromResponse(response: Response): Promise<unknown> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && "_tag" in parsed) {
      return parsed;
    }
  } catch {
    // el cuerpo no era JSON
  }
  return new Error(`HTTP ${response.status}`);
}

// Una respuesta de error de una ruta con progreso (NDJSON). El cuerpo puede ser JSON del contrato
// (`{ message, ... }`), una página de error o un volcado del servidor. Al usuario solo le llega el
// `message` redactado; cualquier otra cosa se cambia por un texto genérico (el detalle está en el
// log del servidor). Nunca se devuelve el cuerpo crudo.
export async function errorFromResponse(response: Response): Promise<Error> {
  const raw = await response.text().catch(() => "");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "message" in parsed &&
      typeof (parsed as { message: unknown }).message === "string" &&
      (parsed as { message: string }).message.trim().length > 0
    ) {
      return new Error((parsed as { message: string }).message);
    }
  } catch {
    // el cuerpo no era JSON
  }
  return new Error("No se pudo completar la operación. Vuelve a intentarlo en un momento.");
}

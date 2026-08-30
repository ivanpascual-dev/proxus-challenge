// Lo que se enseña al usuario cuando algo falla: SOLO el mensaje. Nunca la clase del error, el
// `SchemaError` crudo, una ruta ni la pila. Todo eso es ruido para quien lee y, en un error del
// servidor, una fuga de detalle interno. El detalle técnico ya está en el log (del servidor o en la
// consola del navegador).
//
// Los errores del contrato (`@proxus/shared`) llegan decodificados con un `message` redactado a
// mano en el handler; de ahí sale el texto. Un fallo de red o un error sin `message` cae al genérico.

export const messageOf = (cause: unknown): string => {
  if (typeof cause === "string" && cause.trim().length > 0) {
    return cause;
  }
  if (
    typeof cause === "object" &&
    cause !== null &&
    "message" in cause &&
    typeof (cause as { message: unknown }).message === "string" &&
    (cause as { message: string }).message.trim().length > 0
  ) {
    return (cause as { message: string }).message;
  }
  return "No se pudo completar la operación. Vuelve a intentarlo.";
};

// Un `defect` es un fallo del propio código, no una condición esperada: al usuario no se le enseña
// ningún detalle, solo que algo ha ido mal.
export const DEFECT_MESSAGE = "Algo ha ido mal en la aplicación. Recarga la página y vuelve a intentarlo.";

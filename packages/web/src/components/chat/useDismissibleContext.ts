import { useEffect, useState } from "react";
import type { ChatContextRef } from "@proxus/shared";
import { contextRefKey } from "./ContextBar.tsx";

// El contexto de pantalla se propone solo y se puede quitar (decisión 5, invariante 9): al cambiar de
// material, artefacto o bloque, la propuesta se recalcula y lo que se había quitado deja de aplicar.
// Antes vivía suelto en `Chat.tsx`; se extrae aquí porque el borrador local y la conversación
// guardada lo necesitan por igual (plan de correcciones §4.2.5).
export function useDismissibleContext(
  proposedContext: readonly ChatContextRef[],
  // Quien propuso la referencia puede necesitar enterarse de que se ha retirado: la página adjunta
  // desde el PDF es un adjunto explícito, y retirarla tiene que soltarla en su origen (`App`), no
  // solo esconderla aquí (§5.2, F5-40).
  onDismissed?: (ref: ChatContextRef) => void
) {
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(new Set());

  const proposedContextKey = proposedContext.map(contextRefKey).join("|");
  useEffect(() => {
    setDismissedKeys(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedContextKey]);

  const activeContext = proposedContext.filter((ref) => !dismissedKeys.has(contextRefKey(ref)));

  const dismiss = (ref: ChatContextRef) => {
    setDismissedKeys((current) => new Set(current).add(contextRefKey(ref)));
    onDismissed?.(ref);
  };

  return { activeContext, dismiss };
}

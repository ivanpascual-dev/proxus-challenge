import { useState } from "react";
import type { ChatContextRef } from "@proxus/shared";
import { DraftConversation } from "./chat/DraftConversation.tsx";
import { StoredConversation, type PendingMessage } from "./chat/StoredConversation.tsx";

// Propietario del `conversationId` opcional (plan de correcciones §4.2.5). El chat arranca como
// borrador local sin conversación creada (decisión 12, C5-08); la conversación nace en el servidor
// solo al enviar el primer mensaje válido. `Nueva conversación` y borrar la activa vuelven al
// borrador, sin ninguna escritura.
type ChatState =
  | { readonly kind: "draft" }
  | { readonly kind: "stored"; readonly conversationId: string; readonly pending: PendingMessage | undefined };

export function Chat({
  proposedContext,
  onContextDismissed,
  onOpenCitation
}: {
  readonly proposedContext: readonly ChatContextRef[];
  // Abrir una fuente consultada por Sym (§5.3) es el mismo gesto que abrir la cita de un apunte: lo
  // resuelve `App`, que es quien sabe seleccionar material y navegar a la página.
  readonly onOpenCitation: (materialId: string, page: number) => void;
  // Se avisa a quien propuso el contexto de que el alumno ha retirado un chip (invariante 9): hay
  // referencias, como la página del PDF, que se adjuntan a mano y hay que soltar en su origen.
  readonly onContextDismissed: (ref: ChatContextRef) => void;
}) {
  const [state, setState] = useState<ChatState>({ kind: "draft" });

  if (state.kind === "draft") {
    return (
      <DraftConversation
        proposedContext={proposedContext}
        onContextDismissed={onContextDismissed}
        onConversationCreated={(conversationId, pending) =>
          setState({ kind: "stored", conversationId, pending })}
        onSelectConversation={(conversationId) =>
          setState({ kind: "stored", conversationId, pending: undefined })}
      />
    );
  }

  return (
    <StoredConversation
      key={state.conversationId}
      conversationId={state.conversationId}
      pending={state.pending}
      proposedContext={proposedContext}
      onContextDismissed={onContextDismissed}
      onOpenCitation={onOpenCitation}
      onResetToDraft={() => setState({ kind: "draft" })}
      onSelectConversation={(conversationId) =>
        setState({ kind: "stored", conversationId, pending: undefined })}
    />
  );
}

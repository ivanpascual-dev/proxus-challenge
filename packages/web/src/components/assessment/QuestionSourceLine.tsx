import type { QuestionSource } from "@proxus/shared";

// La cita de una pregunta. La COPIA el código del índice del material (decisión 5); aquí solo se
// pinta. Toda pregunta enseña su cita, y la que no ancló enseña por qué (invariante 2, F3-01/F3-03).
export function QuestionSourceLine({ source }: { readonly source: QuestionSource }) {
  const pages = source.pages.length === 0
    ? "sin páginas ancladas"
    : `pág. ${source.pages.join(", ")}`;

  return (
    <div className="mt-3 border-border border-t pt-2 text-muted text-xs">
      <p>
        Tema <code>{source.topicId}</code> · {pages}
        {source.transcribed && " · incluye una página transcrita por el modelo"}
      </p>
      {source.unanchoredReason !== null && (
        <p className="mt-1 text-warning-ink">
          Cita sin comprobar: {source.unanchoredReason}
        </p>
      )}
    </div>
  );
}

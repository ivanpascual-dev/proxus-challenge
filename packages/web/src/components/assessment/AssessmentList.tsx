import type { AssessmentListEntry } from "@proxus/shared";
import { IconButton } from "../ui/IconButton.tsx";

// Cómo se resuelve una prueba, a partir de su tipo y su modo. Un Control y un Examen de prueba se
// resuelven en el mismo sitio (a libro abierto); un Examen real toma la aplicación entera.
function rowKindLabel(entry: AssessmentListEntry): string {
  if (entry.kind === "quiz") {
    return "Control";
  }
  return entry.mode === "exam" ? "Examen real" : "Examen de prueba";
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function lastAttemptStatusLabel(last: NonNullable<AssessmentListEntry["lastAttempt"]>): string {
  const mode = last.mode === "practice" ? "práctica" : "examen";
  if (last.status === "in-progress") {
    return `${mode}, en curso`;
  }
  if (last.status === "abandoned") {
    return `${mode}, abandonado`;
  }
  if (last.displayedScore === null) {
    return `${mode}, sin evaluar`;
  }
  return mode;
}

// La lista de un grupo (fase 5, §4.9): separadores por fila, no una tarjeta completa por objeto.
// Se muestra como tabla, igual que el resto del panel de material: sin cajas, con líneas finas.
export function AssessmentList({
  entries,
  emptyMessage,
  onOpen,
  onStartExam,
  onHistory
}: {
  readonly entries: readonly AssessmentListEntry[];
  readonly emptyMessage: string;
  readonly onOpen: (entry: AssessmentListEntry) => void;
  readonly onStartExam: (entry: AssessmentListEntry) => void;
  readonly onHistory: (entry: AssessmentListEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="border border-border border-dashed p-6 text-center text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-border border-b text-muted text-xs uppercase tracking-widest">
          <th className="pb-2 font-medium">Prueba</th>
          <th className="pb-2 font-medium">Preguntas</th>
          <th className="pb-2 font-medium">Último intento</th>
          <th className="pb-2 font-medium">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <AssessmentRow
            key={entry.id}
            entry={entry}
            onOpen={() => onOpen(entry)}
            onStartExam={() => onStartExam(entry)}
            onHistory={() => onHistory(entry)}
          />
        ))}
      </tbody>
    </table>
  );
}

function AssessmentRow({
  entry,
  onOpen,
  onStartExam,
  onHistory
}: {
  readonly entry: AssessmentListEntry;
  readonly onOpen: () => void;
  readonly onStartExam: () => void;
  readonly onHistory: () => void;
}) {
  const isRealExam = entry.kind === "test" && entry.mode === "exam";
  const graded = entry.lastAttempt !== null && entry.lastAttempt.status === "graded" && entry.lastAttempt.displayedScore !== null
    ? round2(entry.lastAttempt.displayedScore)
    : null;

  return (
    <tr className="border-border border-b">
      <td className="py-3 pr-4">
        <p className="text-muted text-xs uppercase tracking-widest">
          {rowKindLabel(entry)}
          {entry.origin === "review" && " · de repaso"}
        </p>
        <p className="font-semibold text-heading">{entry.title}</p>
        <p className="text-muted text-sm">{entry.scope.topicLabel}</p>
      </td>
      <td className="py-3 pr-4 text-body">
        {entry.questionCount} {entry.questionCount === 1 ? "pregunta" : "preguntas"}
      </td>
      <td className="py-3 pr-4">
        {entry.lastAttempt === null
          ? <span className="text-muted text-sm">Sin intentos</span>
          : (
              <div className="flex items-center gap-2">
                {graded !== null && (
                  <span className="h-1.5 w-16 overflow-hidden bg-border-strong/40">
                    <span
                      className={`block h-full ${graded >= 5 ? "bg-success" : "bg-danger"}`}
                      style={{ width: `${Math.min(100, (graded / 10) * 100)}%` }}
                    />
                  </span>
                )}
                <span className="text-body text-sm">
                  {graded !== null ? `${graded} / 10` : lastAttemptStatusLabel(entry.lastAttempt)}
                </span>
              </div>
            )}
      </td>
      <td className="py-3">
        <div className="flex flex-wrap items-center gap-2">
          {isRealExam
            ? (
                <button
                  type="button"
                  className="font-semibold text-brand text-sm transition hover:underline active:scale-[0.98]"
                  onClick={onStartExam}
                >
                  Empezar el examen
                </button>
              )
            : (
                <button
                  type="button"
                  className="font-medium text-brand text-sm transition hover:underline active:scale-[0.98]"
                  onClick={onOpen}
                >
                  {entry.kind === "quiz" ? "Practicar" : "Abrir"}
                </button>
              )}
          {entry.lastAttempt !== null && (
            <IconButton icon="history" label="Ver intentos" onClick={onHistory} />
          )}
        </div>
      </td>
    </tr>
  );
}

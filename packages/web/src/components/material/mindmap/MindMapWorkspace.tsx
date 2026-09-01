import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialIndexQuery } from "../../../domain/materials/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../../lib/user-feedback.ts";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { StatusNotice } from "../../ui/StatusNotice.tsx";
import { MindMapCanvas } from "./MindMapCanvas.tsx";

export function MindMapWorkspace({
  materialId,
  title,
  onGenerateControl,
  onGoToNotes,
}: {
  readonly materialId: string;
  readonly title: string;
  readonly onGenerateControl: (topicId: string, topicLabel: string) => void;
  readonly onGoToNotes: (topicPages: readonly number[]) => void;
}) {
  const index = useAtomValue(materialIndexQuery(materialId));

  return AsyncResult.matchWithError(index, {
    onInitial: () => <p className="text-muted" aria-live="polite">Cargando el mapa…</p>,
    onError: (error) => {
      const notice = describeFailure(
        error,
        { area: "materials", action: "index" },
        "MindMapWorkspace",
      );
      return (
        <StatusNotice
          tone="danger"
          title={notice.title}
          {...(notice.description === undefined ? {} : { description: notice.description })}
        />
      );
    },
    onDefect: () => (
      <StatusNotice tone="danger" title="No se pudo cargar el mapa" description={DEFECT_MESSAGE} />
    ),
    onSuccess: ({ value }) => value.topics.length === 0
      ? (
          <EmptyState
            title="Este material no tiene temas detectados"
            description="Puedes seguir consultando el PDF y volver a preparar el material más adelante."
          />
        )
      : (
          <MindMapCanvas
            index={value}
            title={title}
            onGenerateControl={onGenerateControl}
            onGoToNotes={onGoToNotes}
          />
        ),
  });
}

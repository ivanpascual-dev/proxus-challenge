import { useState } from "react";
import { useAtomValue } from "@effect/atom-react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { artifactsQuery } from "../../domain/artifacts/atoms.ts";
import { StatusNotice } from "../ui/StatusNotice.tsx";
import { IconButton } from "../ui/IconButton.tsx";

// Artefactos ilegibles y fallos globales que no pertenecen a un material concreto (fase 5, §4.2): se
// muestran sobre el workspace como aviso compacto. Descartar es solo visual (no borra el fichero ni
// reintenta nada) y no depende de qué material esté seleccionado, así que vive fuera del sidebar de
// 224px (decisión 5) y fuera de `MaterialPanel`.

export function SystemNoticeRegion() {
  const artifacts = useAtomValue(artifactsQuery);
  const [dismissed, setDismissed] = useState(false);

  return AsyncResult.matchWithError(artifacts, {
    onInitial: () => null,
    onError: () => null,
    onDefect: () => null,
    onSuccess: ({ value }) => {
      if (dismissed || value.unreadable.length === 0) {
        return null;
      }
      const count = value.unreadable.length;
      const title = count === 1
        ? "Un fichero de artefacto no se pudo leer."
        : `${count} ficheros de artefacto no se pudieron leer.`;
      return (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-xl">
            <StatusNotice
              tone="warning"
              title={title}
              description={value.unreadable.map((file) => `${file.fileName}: ${file.reason}`).join(" · ")}
              action={
                <IconButton icon="close" label="Descartar aviso" onClick={() => setDismissed(true)} />
              }
            />
          </div>
        </div>
      );
    }
  });
}

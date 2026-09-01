import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialPageKey, materialPageQuery } from "../../../domain/materials/atoms.ts";
import { DEFECT_MESSAGE, describeFailure } from "../../../lib/user-feedback.ts";

// Marca de procedencia de una página, tal como la pinta el visor (fase 3, ADR-001; invariante 8).
export type PageMarker = null | { readonly kind: "extracted" | "transcribed" } | { readonly kind: "failed"; readonly reason: string };

interface PdfPageProps {
  readonly materialId: string;
  readonly page: number;
  readonly marker: PageMarker;
  // Cita externa recién abierta (§4.6, §4.10): 1.5s de highlight, salvo `prefers-reduced-motion`.
  readonly highlighted: boolean;
}

export function PdfPage({ materialId, page, marker, highlighted }: PdfPageProps) {
  const ref = useRef<HTMLElement>(null);
  const [show, setShow] = useState(page <= 2);

  useEffect(() => {
    if (show || ref.current === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [show]);

  return (
    <figure
      ref={ref}
      data-page={page}
      tabIndex={-1}
      className={`scroll-mt-3 rounded-lg outline-none transition-shadow duration-500 ${highlighted ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : ""}`}
    >
      <div className="relative">
        {show
          ? <PdfPageImage materialId={materialId} page={page} />
          : <div className="grid h-[70vh] place-items-center rounded-lg border border-border bg-surface text-muted text-sm">Página {page}</div>}
        {marker?.kind === "transcribed" && (
          <span className="absolute top-2 right-2 rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] text-warning-ink">
            transcrito por el modelo
          </span>
        )}
      </div>
      {marker?.kind === "failed" && (
        <figcaption className="mt-1 rounded-lg bg-danger/10 px-3 py-2 text-danger-ink text-sm">
          Página {page}: no se pudo indexar. {marker.reason}
        </figcaption>
      )}
    </figure>
  );
}

function PdfPageImage({ materialId, page }: { readonly materialId: string; readonly page: number }) {
  const image = useAtomValue(materialPageQuery(materialPageKey(materialId, page)));

  return AsyncResult.matchWithError(image, {
    onInitial: () => <PagePlaceholder>Cargando la página {page}…</PagePlaceholder>,
    onError: (error) => <PageError page={page} detail={describeFailure(error, { area: "materials", action: "page" }, "PdfPage").description ?? ""} />,
    onDefect: () => <PageError page={page} detail={DEFECT_MESSAGE} />,
    onSuccess: ({ value }) => (
      <img src={value.data} alt={`Página ${page}`} className="w-full rounded-lg border border-border" loading="lazy" />
    )
  });
}

function PagePlaceholder({ children }: { readonly children: ReactNode }) {
  return <div className="grid h-[70vh] place-items-center rounded-lg border border-border bg-surface text-muted text-sm">{children}</div>;
}

function PageError({ page, detail }: { readonly page: number; readonly detail: string }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger-ink text-sm">
      No se pudo renderizar la página {page}. {detail}
    </div>
  );
}

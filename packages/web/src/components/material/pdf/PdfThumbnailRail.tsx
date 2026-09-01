import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState } from "react";
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import { materialPageKey, materialPageQuery } from "../../../domain/materials/atoms.ts";

interface PdfThumbnailRailProps {
  readonly materialId: string;
  readonly pageCount: number;
  readonly activePage: number;
  readonly onSelectPage: (page: number) => void;
}

// Tira izquierda de 136px (fase 5, decisión 15, §4.6): todas las páginas listadas, la activa resaltada.
// Cada miniatura reutiliza `materialPageQuery` (no hay endpoint de thumbnail, §9) y solo pide su imagen
// al entrar en viewport con 400px de margen: abrir el material no descarga las 82 páginas de golpe.
export function PdfThumbnailRail({ materialId, pageCount, activePage, onSelectPage }: PdfThumbnailRailProps) {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <nav aria-label="Miniaturas de página" className="w-[136px] shrink-0 overflow-y-auto border-border border-r bg-surface/40 p-2">
      <ul className="grid gap-2">
        {pages.map((page) => (
          <li key={page}>
            <PdfThumbnail
              materialId={materialId}
              page={page}
              active={page === activePage}
              onSelect={() => onSelectPage(page)}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PdfThumbnail({
  materialId,
  page,
  active,
  onSelect
}: {
  readonly materialId: string;
  readonly page: number;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || ref.current === null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      aria-label={`Ir a la página ${page}`}
      className={`flex w-full flex-col items-center gap-1 border p-1 ${
        active ? "border-brand bg-brand-soft" : "border-border hover:border-border-strong"
      }`}
    >
      <span className="grid aspect-[3/4] w-full place-items-center overflow-hidden bg-canvas">
        {visible && <PdfThumbnailImage materialId={materialId} page={page} />}
      </span>
      <span className="text-[0.7rem] text-muted">{page}</span>
    </button>
  );
}

function PdfThumbnailImage({ materialId, page }: { readonly materialId: string; readonly page: number }) {
  const image = useAtomValue(materialPageQuery(materialPageKey(materialId, page)));

  return AsyncResult.matchWithError(image, {
    onInitial: () => null,
    onError: () => <span className="text-[0.6rem] text-danger-ink">Error</span>,
    onDefect: () => <span className="text-[0.6rem] text-danger-ink">Error</span>,
    onSuccess: ({ value }) => <img src={value.data} alt="" className="h-full w-full object-cover" loading="lazy" />
  });
}

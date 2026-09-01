import { useEffect, useMemo, useRef, useState } from "react";
import { IconButton } from "../../ui/IconButton.tsx";
import { PdfPage, type PageMarker } from "./PdfPage.tsx";
import { PdfThumbnailRail } from "./PdfThumbnailRail.tsx";

const MIN_ZOOM = 75;
const MAX_ZOOM = 150;
const ZOOM_STEP = 25;
const DEFAULT_ZOOM = 100;
const HIGHLIGHT_MS = 1500;
// max-w-3xl (48rem) a zoom 100%: el zoom es solo presentación, nunca vuelve a pedir la imagen ni
// cambia la página fuente (fase 5, §4.6).
const BASE_MAX_WIDTH_REM = 48;

interface PdfWorkspaceProps {
  readonly materialId: string;
  readonly pageCount: number;
  readonly markerFor: (page: number) => PageMarker;
  // Página pedida desde fuera (una cita, el mapa mental): se consume una vez y se avisa con
  // `onScrolledToPage`, igual que hacía `IndexedPdfViewer` antes de esta pieza.
  readonly scrollToPage: number | null;
  readonly onScrolledToPage: () => void;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function PdfWorkspace({ materialId, pageCount, markerFor, scrollToPage, onScrolledToPage }: PdfWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ratiosRef = useRef(new Map<number, number>());
  const [activePage, setActivePage] = useState(1);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [pageInputValue, setPageInputValue] = useState("1");
  const [highlightPage, setHighlightPage] = useState<number | null>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const pages = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  // La página activa la decide el lector, no un clic: un único IntersectionObserver sobre todas las
  // figuras, sin crear ninguna petición nueva (§4.11: el mapa no recalcula, y aquí tampoco se pide
  // una imagen solo por saber qué página se ve).
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    ratiosRef.current = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          ratiosRef.current.set(page, entry.intersectionRatio);
        }
        let bestPage: number | null = null;
        let bestRatio = 0;
        for (const [page, ratio] of ratiosRef.current) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestPage = page;
          }
        }
        if (bestPage !== null) {
          setActivePage(bestPage);
        }
      },
      { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    for (const figure of container.querySelectorAll("[data-page]")) {
      observer.observe(figure);
    }
    return () => observer.disconnect();
  }, [pages]);

  useEffect(() => {
    setPageInputValue(String(activePage));
  }, [activePage]);

  const goToPage = (page: number, options?: { readonly focus?: boolean }) => {
    const clamped = Math.min(Math.max(Math.trunc(page), 1), pageCount);
    const target = containerRef.current?.querySelector<HTMLElement>(`[data-page="${clamped}"]`);
    target?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    if (options?.focus === true) {
      target?.focus();
    }
    setActivePage(clamped);
  };

  useEffect(() => {
    if (scrollToPage === null) {
      return;
    }
    goToPage(scrollToPage, { focus: true });
    if (reducedMotion) {
      onScrolledToPage();
      return;
    }
    setHighlightPage(scrollToPage);
    const timer = setTimeout(() => setHighlightPage(null), HIGHLIGHT_MS);
    onScrolledToPage();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToPage]);

  // Enter es una navegación explícita: mueve el foco a la página, como al pulsar una miniatura.
  // Perder el foco (Tab, clic fuera) también aplica el número escrito, pero SIN robar el foco: si no,
  // Tab nunca sale de este campo porque el blur se dispara antes de que el navegador mueva el foco al
  // siguiente control, y esta función lo devolvería a la página.
  const submitPageInput = (options?: { readonly focus?: boolean }) => {
    const parsed = Number(pageInputValue);
    if (Number.isFinite(parsed)) {
      goToPage(parsed, options);
    } else {
      setPageInputValue(String(activePage));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <PdfThumbnailRail
          materialId={materialId}
          pageCount={pageCount}
          activePage={activePage}
          onSelectPage={(page) => goToPage(page, { focus: true })}
        />
        <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mx-auto flex flex-col gap-5" style={{ maxWidth: `${(zoom / 100) * BASE_MAX_WIDTH_REM}rem` }}>
            {pages.map((page) => (
              <PdfPage
                key={page}
                materialId={materialId}
                page={page}
                marker={markerFor(page)}
                highlighted={highlightPage === page}
              />
            ))}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-border border-t px-3 py-2">
        <div className="flex items-center gap-1.5">
          <IconButton icon="chevron-left" label="Página anterior" onClick={() => goToPage(activePage - 1, { focus: true })} disabled={activePage <= 1} />
          <label className="flex items-center gap-1.5 text-muted text-sm">
            <input
              type="number"
              min={1}
              max={pageCount}
              value={pageInputValue}
              onChange={(event) => setPageInputValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitPageInput({ focus: true });
                }
              }}
              onBlur={() => submitPageInput()}
              aria-label="Ir a la página"
              className="w-12 border border-border-strong bg-canvas p-1 text-center text-heading outline-none focus:border-brand"
            />
            <span>/ {pageCount}</span>
          </label>
          <IconButton icon="chevron-right" label="Página siguiente" onClick={() => goToPage(activePage + 1, { focus: true })} disabled={activePage >= pageCount} />
        </div>
        <IconButton icon="fit-width" label="Ajustar ancho" onClick={() => setZoom(DEFAULT_ZOOM)} />
        <div className="flex items-center gap-1">
          <IconButton icon="zoom-out" label="Reducir zoom" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM} />
          <span className="w-10 text-center text-muted text-xs" aria-live="off">{zoom}%</span>
          <IconButton icon="zoom-in" label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM} />
        </div>
      </footer>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { NextStudyAction as Action } from "../../domain/profile/next-study-action.ts";
import { Icon } from "../ui/Icon.tsx";

interface NextStudyActionProps {
  readonly state:
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly action: Action };
  readonly onActivate: (action: Action) => void;
}

interface ActionCopy {
  readonly title: string;
  readonly description: string;
  readonly button: string | null;
}

const actionCopy = (action: Action): ActionCopy => {
  switch (action.kind) {
    case "finish-setup":
      return action.target === "index"
        ? {
            title: "Termina de preparar el material",
            description: "Falta detectar sus temas antes de poder recomendar una práctica.",
            button: "Preparar temas",
          }
        : {
            title: "Prepara tus apuntes",
            description: "El índice ya está listo. Crear los apuntes completa la base de estudio del material.",
            button: "Ir a Apuntes",
          };
    case "first-control":
      return {
        title: `Empieza por ${action.topicLabel}`,
        description: "Todavía no hay intentos corregidos. Un primer Control empezará a poblar tu progreso.",
        button: "Crear primer Control",
      };
    case "review":
      if (action.reason === "incorrect") {
        return {
          title: `Repasa ${action.topicLabel}`,
          description: `${action.count} ${action.count === 1 ? "fallo observado" : "fallos observados"} en este tema.`,
          button: "Crear prueba de repaso",
        };
      }
      if (action.reason === "hint") {
        return {
          title: `Repasa ${action.topicLabel}`,
          description: `${action.count} ${action.count === 1 ? "pista abierta" : "pistas abiertas"} en este tema.`,
          button: "Crear prueba de repaso",
        };
      }
      return {
        title: `Repasa ${action.topicLabel}`,
        description: "Este tema está marcado como importante.",
        button: "Crear prueba de repaso",
      };
    case "new-practice":
      return {
        title: "Continúa con práctica nueva",
        description: "Hay actividad corregida y ninguna señal pide repaso ahora mismo.",
        button: "Ir a Pruebas",
      };
    case "no-data":
      return { title: "No hay datos suficientes todavía.", description: action.reason, button: null };
  }
};

export function NextStudyAction({ state, onActivate }: NextStudyActionProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const action = state.kind === "ready" ? state.action : null;
  const copy = action === null ? null : actionCopy(action);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={state.kind === "loading"}
        className="flex min-h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-brand text-xs transition hover:bg-brand-soft disabled:text-muted"
        onClick={() => setOpen((value) => !value)}
      >
        {state.kind === "loading" ? "Calculando…" : "Siguiente paso"}
        <Icon name="arrow-right" size={16} />
      </button>
      {open && copy !== null && (
        <div
          role="dialog"
          aria-label="Siguiente paso"
          className="absolute top-[calc(100%+10px)] right-0 z-30 w-80 rounded-[10px] border border-border-strong bg-surface p-4 text-left shadow-xl"
        >
          <p className="text-muted text-xs uppercase tracking-widest">Siguiente paso</p>
          <p className="mt-1 font-semibold text-heading text-sm">{copy.title}</p>
          <p className="mt-1 text-body text-sm leading-relaxed">{copy.description}</p>
          {copy.button !== null && action !== null && (
            <button
              type="button"
              className="mt-3 flex min-h-8 items-center gap-1.5 font-semibold text-brand text-sm hover:underline"
              onClick={() => {
                setOpen(false);
                onActivate(action);
              }}
            >
              {copy.button}
              <Icon name="arrow-right" size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

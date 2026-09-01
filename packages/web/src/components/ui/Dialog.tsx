import { useEffect, useRef, type ReactNode } from "react";

// `<dialog>` nativo en vez de reconstruir a mano el foco atrapado (fase 5, §4.2: foco inicial,
// Escape, devolución de foco y fondo inert). `showModal()` ya deja inerte todo lo que queda fuera y
// mueve el foco al primer elemento focusable de dentro; solo hace falta sincronizar el `open` de
// React con el elemento y devolver el foco a quien abrió el diálogo al cerrarlo.

interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  readonly widthClassName?: string;
}

export function Dialog({ open, onClose, title, children, widthClassName = "max-w-lg" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) {
      return;
    }
    if (open) {
      triggerRef.current = document.activeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      return;
    }
    const trigger = triggerRef.current;
    if (trigger instanceof HTMLElement) {
      trigger.focus();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={`fixed inset-0 m-auto h-fit w-full ${widthClassName} rounded-[10px] border border-border bg-surface p-0 text-body backdrop:bg-heading/40`}
    >
      {open && children}
    </dialog>
  );
}

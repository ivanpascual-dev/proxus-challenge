import { useEffect, useRef } from "react";
import { LIMITS } from "@proxus/shared";
import { Icon } from "../ui/Icon.tsx";

// Fase 5, §4.4, decisión 24: el composer no se redimensiona a mano. Crece automáticamente hasta seis
// líneas (152px ≈ 6 × 15px de texto a line-height 1.65, más el relleno vertical), Enter envía,
// Shift+Enter inserta salto, y una composición IME (acentos, japonés, etc.) nunca se envía a mitad.
const MAX_COMPOSER_HEIGHT_PX = 152;

interface ChatComposerProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: (value: string) => void;
  readonly disabled: boolean;
}

export function ChatComposer({ value, onChange, onSubmit, disabled }: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overLimit = value.length > LIMITS.maxMessageCharacters;
  const canSubmit = !disabled && value.trim().length > 0 && !overLimit;

  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT_PX)}px`;
  }, [value]);

  const submit = () => {
    if (canSubmit) {
      onSubmit(value);
    }
  };

  return (
    <form
      className="flex flex-col gap-1.5 border-border border-t bg-canvas px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Pregúntale algo a Sym…"
          rows={1}
          className={`max-h-[152px] w-full flex-1 resize-none overflow-y-auto rounded-sm border bg-surface px-4 py-2.5 text-heading text-sm leading-6 outline-none focus:ring-2 ${
            overLimit ? "border-danger focus:ring-danger" : "border-border-strong focus:ring-brand"
          }`}
          aria-invalid={overLimit}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="grid size-10 shrink-0 place-items-center rounded-sm border border-border-strong bg-surface text-heading transition hover:border-brand active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          aria-label="Enviar mensaje"
        >
          <Icon name="arrow-right" size={18} />
        </button>
      </div>
      <p className={`self-end text-xs ${overLimit ? "text-danger-ink" : "text-muted"}`} aria-live="polite">
        {overLimit
          ? `${value.length} / ${LIMITS.maxMessageCharacters} caracteres: pasa del máximo`
          : `${value.length} / ${LIMITS.maxMessageCharacters}`}
      </p>
    </form>
  );
}

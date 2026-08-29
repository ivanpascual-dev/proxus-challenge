import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { SlashItem } from "./SlashCommand.ts";

export interface SlashMenuHandle {
  // Devuelve true si la tecla la consume el menú (el editor no debe verla).
  readonly onKeyDown: (props: { readonly event: KeyboardEvent }) => boolean;
}

interface SlashMenuProps {
  readonly items: readonly SlashItem[];
  readonly command: (item: SlashItem) => void;
}

// El desplegable que sale al escribir "/". La navegación por teclado la controla el editor a través
// de `onKeyDown` (expuesto por ref); el ratón, los propios botones.
export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  useLayoutEffect(() => {
    const node = listRef.current?.children[selected];
    node?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false;
      }
      if (event.key === "ArrowUp") {
        setSelected((current) => (current - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((current) => (current + 1) % items.length);
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item !== undefined) {
          command(item);
        }
        return true;
      }
      return false;
    }
  }));

  if (items.length === 0) {
    return (
      <div className="w-64 rounded-2xl border border-border bg-surface p-3 text-muted text-sm shadow-lg">
        Sin resultados.
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="max-h-72 w-64 overflow-y-auto rounded-2xl border border-border bg-surface p-1.5 shadow-lg"
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          type="button"
          className={`flex w-full flex-col rounded-xl px-3 py-2 text-left ${
            index === selected ? "bg-brand/10 text-brand" : "text-body hover:bg-surface-muted"
          }`}
          onMouseEnter={() => setSelected(index)}
          onClick={() => command(item)}
        >
          <span className="font-semibold text-sm">{item.title}</span>
          <span className="text-muted text-xs">{item.description}</span>
        </button>
      ))}
    </div>
  );
});

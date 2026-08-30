import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { BLOCK_FORMATS } from "./blockFormats.ts";
import { SlashMenu, type SlashMenuHandle } from "./SlashMenu.tsx";

export interface SlashItem {
  readonly title: string;
  readonly description: string;
  readonly run: (props: { readonly editor: Editor; readonly range: Range }) => void;
}

// El menú "/" ofrece exactamente los mismos formatos que la barra flotante (misma lista en
// `blockFormats.ts`). Aquí sólo se antepone borrar el "/" que abrió el menú antes de aplicar.
const ITEMS: readonly SlashItem[] = BLOCK_FORMATS.map((format) => ({
  title: format.title,
  description: format.description,
  run: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).run();
    format.apply(editor);
  }
}));

const filterItems = (query: string): readonly SlashItem[] => {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return ITEMS;
  }
  return ITEMS.filter((item) => item.title.toLowerCase().includes(needle));
};

// El menú tipo Notion: "/" al principio de una línea abre un desplegable de formatos. El posicionado
// lo lleva `@tiptap/suggestion` (props.mount): se ancla al cursor y se recoloca solo al hacer scroll.
export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        startOfLine: true,
        // Dentro de una tabla "/" no abre nada: convertir una celda en encabezado, lista o (peor)
        // otra tabla rompería la serialización a tabla GFM limpia.
        allow: ({ editor }) => !editor.isActive("table"),
        items: ({ query }) => [...filterItems(query)],
        command: ({ editor, range, props }) => props.run({ editor, range }),
        render: () => {
          let component: ReactRenderer<SlashMenuHandle> | undefined;
          let unmount: (() => void) | undefined;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor
              });
              unmount = props.mount(component.element);
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command });
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                unmount?.();
                return true;
              }
              return component?.ref?.onKeyDown({ event: props.event }) ?? false;
            },
            onExit: () => {
              unmount?.();
              component?.destroy();
              component = undefined;
              unmount = undefined;
            }
          };
        }
      })
    ];
  }
});

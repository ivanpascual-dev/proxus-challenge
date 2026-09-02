import { removeColumn, removeRow, selectedRect } from "@tiptap/pm/tables";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef } from "react";
import { Icon } from "../ui/Icon.tsx";
import { BLOCK_FORMATS } from "./blockFormats.ts";
import { noteBlockSchemaExtensions } from "./noteBlockSchema.ts";
import { SlashCommand } from "./SlashCommand.ts";

interface BlockEditorProps {
  readonly markdown: string;
  readonly onChange: (markdown: string) => void;
  readonly placeholder?: string;
}

const CELL_TYPES = new Set(["tableCell", "tableHeader"]);

// Un editor por bloque, sobre el markdown de ese bloque. Se escribe con formato (barra flotante al
// seleccionar, menú "/" para insertar) pero lo que sale y se guarda sigue siendo markdown limpio:
// `tiptap-markdown` hace el viaje de ida y vuelta y `html: false` evita que se cuele HTML.
export function BlockEditor({ markdown, onChange, placeholder }: BlockEditorProps) {
  // El markdown que el editor tiene al cargar, ya en su forma canónica (la que sale de volver a
  // serializar): viñetas `*` -> `-`, líneas en blanco normalizadas. Un update que coincida con esto
  // no ensucia el apunte (es sólo la re-serialización del montaje o de un re-montaje de StrictMode).
  const canonical = useRef<string | null>(null);
  // El valor del prop `markdown` que ya está reflejado en el editor. Evita reinyectar en el montaje
  // el mismo contenido que ya se pasó como `content`.
  const syncedProp = useRef(markdown);

  const editor = useEditor({
    extensions: [
      ...noteBlockSchemaExtensions(),
      Placeholder.configure({
        // La pista de "/" va en cada párrafo vacío que tiene el foco, menos dentro de una celda de
        // tabla: ahí "/" no abre nada (no es principio de bloque) y el texto sólo estorbaría.
        includeChildren: true,
        placeholder: ({ editor: instance, node, pos }) => {
          if (node.type.name !== "paragraph") {
            return "";
          }
          if (CELL_TYPES.has(instance.state.doc.resolve(pos).parent.type.name)) {
            return "";
          }
          return placeholder ?? "Escribe «/» para ver las opciones de formato…";
        }
      }),
      SlashCommand
    ],
    content: markdown,
    editorProps: {
      attributes: {
        class: "tiptap-block prose dark:prose-invert max-w-none focus:outline-none"
      }
    },
    onCreate: ({ editor: instance }) => {
      canonical.current = instance.storage.markdown.getMarkdown();
    },
    onUpdate: ({ editor: instance }) => {
      const next = instance.storage.markdown.getMarkdown();
      // Sólo cuenta como cambio si el texto difiere de lo que el editor tenía al cargar. Así, volver
      // a serializar en el montaje (o un re-montaje de StrictMode) no ensucia el apunte.
      if (next === canonical.current) {
        return;
      }
      canonical.current = next;
      syncedProp.current = next;
      onChange(next);
    }
  });

  // En TipTap v3 el componente no se re-renderiza en cada transacción, así que el estado "activo" de
  // los botones de la barra se lee con `useEditorState`, que sí reacciona a la selección.
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) =>
      instance === null
        ? null
        : {
            isBold: instance.isActive("bold"),
            isItalic: instance.isActive("italic"),
            isLink: instance.isActive("link"),
            inTable: instance.isActive("table"),
            activeFormats: BLOCK_FORMATS.map((format) => format.isActive(instance))
          }
  });

  // Cuando el markdown llega cambiado desde fuera (guardar recarga el borrador, «Reemplazar el
  // bloque» de una reescritura) se resincroniza sin emitir update. El eco del propio cambio y el
  // contenido con el que ya se montó no vuelven a inyectarse.
  useEffect(() => {
    if (editor === null || editor.isDestroyed) {
      return;
    }
    if (markdown === syncedProp.current) {
      return;
    }
    syncedProp.current = markdown;
    editor.commands.setContent(markdown, { emitUpdate: false });
    canonical.current = editor.storage.markdown.getMarkdown();
  }, [editor, markdown]);

  if (editor === null || state === null) {
    return null;
  }

  // Quitar fila/columna va siempre por el extremo: la última fila y la última columna. Así nunca se
  // borra la fila de cabecera ni la primera columna (y una tabla sin cabecera se serializaría como
  // HTML, no como tabla GFM). Cuando sólo queda la cabecera, o una columna, no hace nada.
  const removeLastRow = () => {
    editor
      .chain()
      .focus()
      .command(({ state, tr, dispatch }) => {
        let rect;
        try {
          rect = selectedRect(state);
        } catch {
          return false;
        }
        if (rect.map.height <= 1) {
          return false;
        }
        if (dispatch) {
          removeRow(tr, rect, rect.map.height - 1);
        }
        return true;
      })
      .run();
  };

  const removeLastColumn = () => {
    editor
      .chain()
      .focus()
      .command(({ state, tr, dispatch }) => {
        let rect;
        try {
          rect = selectedRect(state);
        } catch {
          return false;
        }
        if (rect.map.width <= 1) {
          return false;
        }
        if (dispatch) {
          removeColumn(tr, rect, rect.map.width - 1);
        }
        return true;
      })
      .run();
  };

  // El elemento al que se ancla la barra de tabla: el `.tableWrapper` que contiene el cursor. Así la
  // barra sale justo encima de esa tabla, no encima del bloque entero.
  const tableAnchor = (): { getBoundingClientRect: () => DOMRect } | null => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name === "table") {
        const dom = editor.view.nodeDOM($from.before(depth));
        if (dom instanceof HTMLElement) {
          return { getBoundingClientRect: () => dom.getBoundingClientRect() };
        }
      }
    }
    return null;
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1 border-border border-b pb-2">
        {BLOCK_FORMATS.map((format, index) => (
          <FormatButton
            key={format.title}
            active={state.activeFormats[index] ?? false}
            label={format.title}
            onClick={() => format.apply(editor)}
          >
            {format.short}
          </FormatButton>
        ))}
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        <FormatButton
          active={state.isBold}
          label="Negrita"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </FormatButton>
        <FormatButton
          active={state.isItalic}
          label="Cursiva"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </FormatButton>
        <FormatButton
          active={state.isLink}
          label="Enlace"
          onClick={() => {
            const previous = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("Dirección del enlace", previous ?? "https://");
            if (url === null) {
              return;
            }
            if (url.trim() === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
          }}
        >
          <Icon name="link" size={16} />
        </FormatButton>
      </div>

      <BubbleMenu
        editor={editor}
        pluginKey="tableMenu"
        options={{ placement: "top-start", offset: 6 }}
        getReferencedVirtualElement={tableAnchor}
        shouldShow={({ editor: instance }) => instance.isActive("table")}
      >
        <div className="flex flex-wrap items-center gap-1 border border-border bg-surface p-1 text-xs shadow-lg">
          <span className="px-1 text-muted">Tabla:</span>
          <TableButton label="Añadir fila" onClick={() => editor.chain().focus().addRowAfter().run()}>
            + fila
          </TableButton>
          <TableButton
            label="Añadir columna"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            + columna
          </TableButton>
          <TableButton label="Quitar la última fila" onClick={removeLastRow}>
            − fila
          </TableButton>
          <TableButton label="Quitar la última columna" onClick={removeLastColumn}>
            − columna
          </TableButton>
          <TableButton
            label="Borrar la tabla"
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            borrar tabla
          </TableButton>
        </div>
      </BubbleMenu>

      <EditorContent editor={editor} />
    </div>
  );
}

interface FormatButtonProps {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function FormatButton({ active, label, onClick, children }: FormatButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={`min-w-8 px-2 py-1 text-sm ${
        active ? "bg-brand/15 text-brand" : "text-body hover:bg-surface-muted"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

interface TableButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function TableButton({ label, onClick, children }: TableButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className=" px-2 py-1 text-body hover:bg-surface-muted"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

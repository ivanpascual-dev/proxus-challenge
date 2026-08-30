import type { Editor } from "@tiptap/core";

// Los formatos de bloque que ofrecen tanto el menú "/" como la barra flotante al seleccionar. Una
// sola lista para que las dos no puedan divergir: si se añade uno, aparece en los dos sitios.
//
// Ninguno mete markdown que `tiptap-markdown` no sepa volver a serializar limpio: encabezados,
// listas, cita y código salen de StarterKit; la tabla se guarda como tabla GFM de tuberías (probado
// que el viaje de ida y vuelta es idéntico si tiene fila de cabecera y celdas de un solo párrafo).
export interface BlockFormat {
  readonly title: string;
  // Etiqueta corta para la barra flotante, donde no cabe el título entero.
  readonly short: string;
  readonly description: string;
  readonly isActive: (editor: Editor) => boolean;
  readonly apply: (editor: Editor) => void;
}

export const BLOCK_FORMATS: readonly BlockFormat[] = [
  {
    title: "Texto",
    short: "T",
    description: "Párrafo normal",
    isActive: (editor) => editor.isActive("paragraph") && !editor.isActive("table"),
    apply: (editor) => {
      editor.chain().focus().setParagraph().run();
    }
  },
  {
    title: "Título",
    short: "H2",
    description: "Encabezado de sección (H2)",
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    apply: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    }
  },
  {
    title: "Subtítulo",
    short: "H3",
    description: "Encabezado de subsección (H3)",
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    apply: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    }
  },
  {
    title: "Sub-subtítulo",
    short: "H4",
    description: "Encabezado de apartado (H4)",
    isActive: (editor) => editor.isActive("heading", { level: 4 }),
    apply: (editor) => {
      editor.chain().focus().toggleHeading({ level: 4 }).run();
    }
  },
  {
    title: "Encabezado menor",
    short: "H5",
    description: "Encabezado de quinto nivel (H5)",
    isActive: (editor) => editor.isActive("heading", { level: 5 }),
    apply: (editor) => {
      editor.chain().focus().toggleHeading({ level: 5 }).run();
    }
  },
  {
    title: "Encabezado mínimo",
    short: "H6",
    description: "Encabezado de sexto nivel (H6)",
    isActive: (editor) => editor.isActive("heading", { level: 6 }),
    apply: (editor) => {
      editor.chain().focus().toggleHeading({ level: 6 }).run();
    }
  },
  {
    title: "Lista",
    short: "•",
    description: "Lista con viñetas",
    isActive: (editor) => editor.isActive("bulletList"),
    apply: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    }
  },
  {
    title: "Lista numerada",
    short: "1.",
    description: "Lista ordenada",
    isActive: (editor) => editor.isActive("orderedList"),
    apply: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    }
  },
  {
    title: "Cita",
    short: "❝",
    description: "Bloque citado",
    isActive: (editor) => editor.isActive("blockquote"),
    apply: (editor) => {
      editor.chain().focus().toggleBlockquote().run();
    }
  },
  {
    title: "Código",
    short: "</>",
    description: "Bloque de código",
    isActive: (editor) => editor.isActive("codeBlock"),
    apply: (editor) => {
      editor.chain().focus().toggleCodeBlock().run();
    }
  },
  {
    title: "Tabla",
    short: "Tabla",
    description: "Tabla con fila de cabecera",
    isActive: (editor) => editor.isActive("table"),
    apply: (editor) => {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
  }
];

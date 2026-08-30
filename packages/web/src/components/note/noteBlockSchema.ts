import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

// Las extensiones que definen el ESQUEMA del bloque y su serialización a markdown. Viven aparte de
// `BlockEditor.tsx` para que el editor real y el test de round-trip (F2-41) partan de la misma
// configuración: si alguien añade un formato que `tiptap-markdown` no serializa limpio, el test lo
// caza. `BlockEditor` añade encima Placeholder y SlashCommand, que no tocan el esquema.
export const noteBlockSchemaExtensions = () => [
  StarterKit.configure({
    link: { openOnClick: false, autolink: true },
    // Sin regla horizontal: markdown la serializa como "---" y choca con los separadores YAML.
    horizontalRule: false,
    // Sin subrayado: solo se representa con `<u>` y `tiptap-markdown` lo perdería en silencio al
    // guardar (F2-41). Fuera del esquema, el atajo Mod-U no hace nada y no hay nada que perder.
    underline: false
  }),
  // Tabla GFM: fila de cabecera, sin redimensionar columnas y envuelta en `.tableWrapper`.
  TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
  // `html: false` impide que se cuele HTML en el markdown guardado (F2-41). `breaks: true` mantiene
  // los saltos de línea sueltos del markdown ya guardado.
  Markdown.configure({ html: false, transformPastedText: true, breaks: true })
];

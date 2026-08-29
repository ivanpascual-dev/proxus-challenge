// `tiptap-markdown` 0.9.0 expone `Markdown` como extensión pero no aumenta el módulo de TipTap, así
// que `editor.storage.markdown` queda sin tipar. Declaramos lo único que usamos de él.
import "@tiptap/core";

declare module "@tiptap/core" {
  interface Storage {
    markdown: {
      getMarkdown(): string;
    };
  }
}

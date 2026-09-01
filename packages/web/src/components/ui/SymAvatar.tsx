// Avatar de Sym: disco de color de marca con una chispa en blanco y un destello menor. Sym es el
// tutor de IA de Symma; la chispa lo identifica como asistente sin recurrir a un monograma que a
// tamaño pequeño se lee mal. Decorativo (`aria-hidden`): el nombre "Sym" está escrito al lado en
// cada sitio donde aparece.
//
// La chispa principal es simétrica en los dos ejes; el grupo se sube un pelín (`translate 0 -1`)
// para que quede ópticamente centrada, no geométricamente. El `<svg>` va en `block` dentro de un
// grid centrado para que no lo desplace el hueco de línea base.
export function SymAvatar({ size = 28, className }: { readonly size?: number; readonly className?: string }) {
  const glyph = Math.round(size * 0.66);
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand text-on-brand ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor" className="block">
        <g transform="translate(0 -1)">
          <path d="M12 2C12.7 6 12.9 6.9 14.7 8.7C16.5 10.5 17.4 10.7 21.4 11.4C17.4 12.1 16.5 12.3 14.7 14.1C12.9 15.9 12.7 16.8 12 20.8C11.3 16.8 11.1 15.9 9.3 14.1C7.5 12.3 6.6 12.1 2.6 11.4C6.6 10.7 7.5 10.5 9.3 8.7C11.1 6.9 11.3 6 12 2Z" />
          <path d="M17.8 3.1C18 4.4 18.1 4.7 19.4 4.9C18.1 5.1 18 5.4 17.8 6.7C17.6 5.4 17.5 5.1 16.2 4.9C17.5 4.7 17.6 4.4 17.8 3.1Z" opacity="0.85" />
        </g>
      </svg>
    </span>
  );
}

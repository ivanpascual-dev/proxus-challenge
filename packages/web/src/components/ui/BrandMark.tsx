// Marca de Symma redibujada como vector plano (fase 5, decisión 27: SVG local, sin librería). El
// `logo.jpg` original es un render 3D con degradados y perspectiva que no se puede convertir con
// fidelidad; esta es su lectura plana: la "S" de cinta en dos tiempos, morado arriba y oro abajo. Un
// logotipo conserva sus colores en los dos temas, así que la variante a color no hereda el token de
// texto; `mono` sí lo hace para pintarla sobre un fondo de marca (avatar de Sym, favicon monocromo).

interface BrandMarkProps {
  readonly size?: number;
  readonly className?: string;
  readonly mono?: boolean;
  readonly title?: string;
}

export function BrandMark({ size = 24, className, mono = false, title = "Symma" }: BrandMarkProps) {
  const top = mono ? "currentColor" : "#793EF9";
  const bottom = mono ? "currentColor" : "#D4AF37";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <path
        d="M23.5 10.5C23.5 6.9 20.1 4 16 4S8.5 6.9 8.5 10.5c0 2.8 1.9 4.7 5.6 5.6"
        stroke={top}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d="M8.5 21.5C8.5 25.1 11.9 28 16 28s7.5-2.9 7.5-6.5c0-2.8-1.9-4.7-5.6-5.6"
        stroke={bottom}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  );
}

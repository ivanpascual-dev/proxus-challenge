// SVG local, sin librería (fase 5, decisión 27). Unión de nombres cerrada: un icono nuevo se añade
// aquí explícitamente, nunca como una cadena arbitraria. 16 o 18px, trazo de la corriente de texto
// (`currentColor`) para heredar el token semántico del elemento que lo contiene.

export type IconName =
  | "theme-system"
  | "theme-light"
  | "theme-dark"
  | "upload"
  | "trash"
  | "close"
  | "check"
  | "check-circle"
  | "warning"
  | "info"
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "arrow-right"
  | "progress"
  | "history"
  | "search"
  | "zoom-in"
  | "zoom-out"
  | "fit-width";

interface IconProps {
  readonly name: IconName;
  readonly size?: 16 | 18;
  readonly className?: string;
}

const iconPaths = ({ name }: { readonly name: IconName }) => {
  switch (name) {
    case "theme-system":
      return (
        <>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8M12 16v4" />
        </>
      );
    case "theme-light":
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </>
      );
    case "theme-dark":
      return <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />;
    case "upload":
      return <path d="M12 20V6M6 11l6-6 6 6M4 20h16" />;
    case "trash":
      return <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />;
    case "close":
      return <path d="M5 5l14 14M19 5L5 19" />;
    case "check":
      return <path d="M4 12l5 5L20 6" />;
    case "check-circle":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </>
      );
    case "warning":
      return (
        <>
          <path d="M12 3 2 20h20L12 3Z" />
          <path d="M12 10v4M12 17h.01" />
        </>
      );
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v5h1" />
        </>
      );
    case "chevron-down":
      return <path d="M5 8l7 7 7-7" />;
    case "chevron-right":
      return <path d="M9 5l7 7-7 7" />;
    case "chevron-left":
      return <path d="M15 5l-7 7 7 7" />;
    case "arrow-right":
      return <path d="M4 12h16M13 5l7 7-7 7" />;
    case "progress":
      return (
        <>
          <path d="M4 20V10M12 20V4M20 20v-6" />
        </>
      );
    case "history":
      return (
        <>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 3" />
        </>
      );
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </>
      );
    case "zoom-in":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M11 8v6M8 11h6M20 20l-3.5-3.5" />
        </>
      );
    case "zoom-out":
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="M8 11h6M20 20l-3.5-3.5" />
        </>
      );
    case "fit-width":
      return <path d="M3 8V6a2 2 0 0 1 2-2h2M21 8V6a2 2 0 0 0-2-2h-2M3 16v2a2 2 0 0 0 2 2h2M21 16v2a2 2 0 0 1-2 2h-2M7 12h10M7 12l2.5-2.5M7 12l2.5 2.5M17 12l-2.5-2.5M17 12l-2.5 2.5" />;
  }
};

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {iconPaths({ name })}
    </svg>
  );
}

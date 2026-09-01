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
  | "fit-width"
  | "plus"
  | "link"
  | "notes"
  | "save"
  | "sparkles"
  | "play"
  | "book-open"
  | "lock"
  | "refresh"
  | "edit"
  | "star";

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
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "link":
      return <path d="M9 15l6-6M8 12a4 4 0 0 1 0-5.5l2-2a4 4 0 0 1 5.5 5.5l-1 1M16 12a4 4 0 0 1 0 5.5l-2 2a4 4 0 0 1-5.5-5.5l1-1" />;
    case "notes":
      return (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v5h5M9 12h6M9 16h6" />
        </>
      );
    case "save":
      return (
        <>
          <path d="M5 3h12l2 2v16H5z" />
          <path d="M8 3v6h8V3M8 21v-7h8v7" />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
          <path d="m18.5 13 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 13l.8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z" />
        </>
      );
    case "play":
      return <path d="m8 5 11 7-11 7V5Z" />;
    case "book-open":
      return (
        <>
          <path d="M3 5.5A4.5 4.5 0 0 1 7.5 4H11v16H7.5A4.5 4.5 0 0 0 3 21.5z" />
          <path d="M21 5.5A4.5 4.5 0 0 0 16.5 4H13v16h3.5a4.5 4.5 0 0 1 4.5 1.5z" />
        </>
      );
    case "lock":
      return (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
        </>
      );
    case "refresh":
      return (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6.1 8A7 7 0 0 1 18.5 6.5L20 12M4 12l1.5 5.5A7 7 0 0 0 17.9 16" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
          <path d="m14 7 3 3" />
        </>
      );
    case "star":
      return <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />;
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

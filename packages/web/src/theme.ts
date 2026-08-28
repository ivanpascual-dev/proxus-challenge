export type Theme = "light" | "dark";

// Lo que el usuario elige. "system" (por defecto) sigue a `prefers-color-scheme` en vivo; "light" y
// "dark" son una elección explícita que se conserva entre visitas (F1-21, F1-22).
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "proxus-theme";

export const getStoredPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  } catch {
    return "system";
  }
};

export const getSystemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const resolveTheme = (preference: ThemePreference): Theme =>
  preference === "system" ? getSystemTheme() : preference;

const paintTheme = (theme: Theme): void => {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
};

export const applyPreference = (preference: ThemePreference): void => {
  paintTheme(resolveTheme(preference));

  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // localStorage no disponible (navegación privada, etc.): el tema ya se aplicó igual.
  }
};

// Reacciona a los cambios de la preferencia del sistema operativo, pero solo mientras la elección
// guardada sea "system": una elección explícita no se pisa porque el SO cambie. Devuelve la función
// para dejar de escuchar.
export const watchSystemTheme = (): (() => void) => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getStoredPreference() === "system") {
      paintTheme(getSystemTheme());
    }
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
};

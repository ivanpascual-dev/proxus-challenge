export type Theme = "light" | "dark";

const STORAGE_KEY = "proxus-theme";

export const getStoredTheme = (): Theme | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
};

export const getSystemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export const getActiveTheme = (): Theme =>
  document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

export const applyTheme = (theme: Theme): void => {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage no disponible (navegación privada, etc.): el atributo ya se aplicó igual.
  }
};

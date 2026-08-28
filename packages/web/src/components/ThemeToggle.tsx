import { useState } from "react";
import { applyTheme, getActiveTheme, type Theme } from "../theme.ts";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getActiveTheme());

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border border-border px-3 py-1.5 text-muted text-xs hover:border-brand hover:text-brand"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

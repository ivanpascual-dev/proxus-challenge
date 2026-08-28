import { useEffect, useState } from "react";
import { applyPreference, getStoredPreference, watchSystemTheme, type ThemePreference } from "../theme.ts";

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredPreference());

  // Mientras la elección sea "Sistema", seguir los cambios de tema del SO sin recargar.
  useEffect(() => watchSystemTheme(), []);

  return (
    <select
      aria-label="Tema"
      value={preference}
      onChange={(event) => {
        const next = event.currentTarget.value as ThemePreference;
        applyPreference(next);
        setPreference(next);
      }}
      className="rounded-full border border-border bg-surface px-2.5 py-1 text-body text-xs outline-none hover:border-brand focus:border-brand"
    >
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Oscuro</option>
    </select>
  );
}

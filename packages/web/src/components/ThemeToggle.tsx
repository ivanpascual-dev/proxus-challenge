import { useEffect, useState } from "react";
import { applyPreference, getStoredPreference, watchSystemTheme, type ThemePreference } from "../theme.ts";
import { IconButton } from "./ui/IconButton.tsx";

const OPTIONS: ReadonlyArray<{ readonly value: ThemePreference; readonly icon: "theme-system" | "theme-light" | "theme-dark"; readonly label: string }> = [
  { value: "system", icon: "theme-system", label: "Tema del sistema" },
  { value: "light", icon: "theme-light", label: "Tema claro" },
  { value: "dark", icon: "theme-dark", label: "Tema oscuro" }
];

// Tres IconButton con `aria-pressed` y tooltip (fase 5, §4.2), no un `<select>`: el pie del sidebar
// tiene sitio de sobra para las tres opciones a la vista, sin abrir un menú para cambiar de tema.
export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredPreference());

  // Mientras la elección sea "Sistema", seguir los cambios de tema del SO sin recargar.
  useEffect(() => watchSystemTheme(), []);

  return (
    <div role="group" aria-label="Tema" className="flex items-center gap-1">
      {OPTIONS.map((option) => (
        <IconButton
          key={option.value}
          icon={option.icon}
          label={option.label}
          pressed={preference === option.value}
          onClick={() => {
            applyPreference(option.value);
            setPreference(option.value);
          }}
        />
      ))}
    </div>
  );
}

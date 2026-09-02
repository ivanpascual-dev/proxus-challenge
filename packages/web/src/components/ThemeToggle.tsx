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
//
// Plan de correcciones §4.2.8 / C5-13: en el rail contraído no cabe la tríada, así que `compact`
// renderiza un único control que rota entre las tres opciones y conserva su nombre accesible.
export function ThemeToggle({ compact = false }: { readonly compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredPreference());

  // Mientras la elección sea "Sistema", seguir los cambios de tema del SO sin recargar.
  useEffect(() => watchSystemTheme(), []);

  const choose = (value: ThemePreference) => {
    applyPreference(value);
    setPreference(value);
  };

  if (compact) {
    const currentIndex = OPTIONS.findIndex((option) => option.value === preference);
    const current = OPTIONS[currentIndex] ?? OPTIONS[0]!;
    const next = OPTIONS[(currentIndex + 1) % OPTIONS.length]!;
    return (
      <IconButton
        icon={current.icon}
        label={`${current.label}. Cambiar a: ${next.label.toLowerCase()}`}
        onClick={() => choose(next.value)}
      />
    );
  }

  return (
    <div role="group" aria-label="Tema" className="flex items-center gap-1">
      {OPTIONS.map((option) => (
        <IconButton
          key={option.value}
          icon={option.icon}
          label={option.label}
          pressed={preference === option.value}
          onClick={() => choose(option.value)}
        />
      ))}
    </div>
  );
}

import { LIMITS } from "@proxus/shared";

// Gemini trocea cada imagen en tiles con unidad de recorte floor(lado_corto / 1.5) y los consume a
// 768 px. Con el lado corto a 1152 px los recortes son de 768 px exactos, 1:1, y no se paga ni un
// byte por píxeles que el modelo descarta. Por eso el renderizado usa una regla de lado corto y no
// un dpi fijo (decisión 3 del plan de la fase 1): un dpi fijo produce imágenes de tamaño
// radicalmente distinto según el tamaño físico de la página.
//
// 1152 px * 72 pt/pulgada = 82944. renderDpi(1080) ≈ 77 (diapositiva 16:9), renderDpi(595) ≈ 139 (A4).
export const renderDpi = (shortSidePoints: number): number =>
  Math.round((LIMITS.renderShortSidePixels * 72) / shortSidePoints);

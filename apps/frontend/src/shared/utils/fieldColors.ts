/**
 * Field Color Utilities
 *
 * Generates deterministic, accessible colors for field highlighting based on field keys.
 * Uses FNV-1a hashing for deterministic color generation and WCAG contrast calculations
 * to ensure text/border readability.
 */

/**
 * Fast deterministic hash using FNV-1a 32-bit algorithm
 */
function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Convert HSL color to RGB (0-255)
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] =
    hh < 1
      ? [c, x, 0]
      : hh < 2
        ? [x, c, 0]
        : hh < 3
          ? [0, c, x]
          : hh < 4
            ? [0, x, c]
            : hh < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

/**
 * Convert sRGB color component to linear RGB
 */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * Calculate WCAG relative luminance for an RGB color
 */
function relLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(srgbToLinear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculate WCAG contrast ratio between two colors
 */
function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const L1 = relLuminance(a);
  const L2 = relLuminance(b);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface FieldColors {
  /** Fill color in CSS format (hsl) */
  fillCss: string;
  /** Foreground (text/border) color in CSS format (#000 or #fff) */
  fgCss: string;
  /** RGB values for the fill color */
  fillRgb: [number, number, number];
  /** The hue value (0-360) */
  hue: number;
}

/**
 * Generate a deterministic, accessible color scheme for a field key
 *
 * @param key - The field key to generate colors for
 * @param options - Color generation options
 * @returns Object containing fill and foreground colors with good contrast
 *
 * @example
 * ```tsx
 * const { fillCss, fgCss } = colorForFieldKey('invoice_number');
 * // fillCss: "hsl(234 70% 55%)"
 * // fgCss: "#fff"
 *
 * <div style={{ backgroundColor: fillCss, color: fgCss }}>
 *   Invoice Number
 * </div>
 * ```
 */
export function colorForFieldKey(
  key: string,
  options: {
    /** Saturation percentage (0-100). Default: 70 */
    saturation?: number;
    /** Lightness percentage (0-100). Default: 55 */
    lightness?: number;
  } = {},
): FieldColors {
  const { saturation = 70, lightness = 55 } = options;

  const h = fnv1a32(key);

  // Hue from hash, fixed S/L band for consistency
  const hue = h % 360;

  const fillRgb = hslToRgb(hue, saturation, lightness);
  const fillCss = `hsl(${hue} ${saturation}% ${lightness}%)`;

  const black: [number, number, number] = [0, 0, 0];
  const white: [number, number, number] = [255, 255, 255];

  const fgCss =
    contrastRatio(fillRgb, black) >= contrastRatio(fillRgb, white)
      ? "#000"
      : "#fff";

  return { fillCss, fgCss, fillRgb, hue };
}

/**
 * Generate colors with alpha transparency for overlays
 *
 * @param key - The field key to generate colors for
 * @param alpha - Alpha transparency value (0-1). Default: 0.15
 * @returns Object containing rgba fill color and solid foreground color
 *
 * @example
 * ```tsx
 * const { fillCss, fgCss } = colorForFieldKeyWithAlpha('total_amount', 0.2);
 * // fillCss: "rgba(123, 45, 67, 0.2)"
 * // fgCss: "#fff"
 * ```
 */
export function colorForFieldKeyWithAlpha(
  key: string,
  alpha: number = 0.15,
  options: {
    saturation?: number;
    lightness?: number;
  } = {},
): FieldColors & { fillCssAlpha: string } {
  const colors = colorForFieldKey(key, options);
  const [r, g, b] = colors.fillRgb;
  const fillCssAlpha = `rgba(${r}, ${g}, ${b}, ${alpha})`;

  return {
    ...colors,
    fillCssAlpha,
  };
}

/**
 * Generate a border color (more saturated version of the fill)
 *
 * @param key - The field key to generate colors for
 * @returns Object containing border color and standard fill/foreground colors
 */
export function colorForFieldKeyWithBorder(
  key: string,
  options: {
    saturation?: number;
    lightness?: number;
    borderDarken?: number;
  } = {},
): FieldColors & { borderCss: string } {
  const { borderDarken = 15, ...colorOptions } = options;
  const colors = colorForFieldKey(key, colorOptions);

  // Create a darker border by reducing lightness
  const borderLightness = Math.max(
    0,
    (colorOptions.lightness ?? 55) - borderDarken,
  );
  const borderRgb = hslToRgb(
    colors.hue,
    colorOptions.saturation ?? 70,
    borderLightness,
  );
  const [r, g, b] = borderRgb;
  const borderCss = `rgb(${r}, ${g}, ${b})`;

  return {
    ...colors,
    borderCss,
  };
}

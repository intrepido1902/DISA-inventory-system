// ⚠️  PLACEHOLDER — reemplazar con los colores reales de DISA
// Product.color guarda el número como texto ("1", "2", etc.)
export const BLACKOUT_COLOR_MAP: Record<string, string> = {
  '1': 'Blanco',
  '2': 'Negro',
  '3': 'Gris Claro',
  '4': 'Gris Oscuro',
  '5': 'Beige',
  '6': 'Arena',
  '7': 'Café',
  '8': 'Azul Marino',
};

/**
 * Devuelve el nombre del color para un producto Blackout.
 * colorNumber = Product.color (ej: "2" → "Negro")
 */
export function getBlackoutColorName(colorNumber: string): string {
  return BLACKOUT_COLOR_MAP[colorNumber.trim()] ?? `Color ${colorNumber}`;
}

/** True si el producto pertenece a la categoría Blackout. */
export function isBlackoutProduct(categoryName: string): boolean {
  return categoryName.toLowerCase() === 'blackout';
}

// ⚠️  PLACEHOLDER — reemplazar con los colores reales de DISA antes de producción
// El número se extrae del código del producto: BL-001 → "1", BL-008 → "8"
export const BLACKOUT_COLOR_MAP: Record<string, string> = {
  '1': 'Blanco',
  '2': 'Negro',
  '3': 'Gris',
  '4': 'Beige',
  '5': 'Arena',
  '6': 'Crema',
  '7': 'Café',
  '8': 'Azul',
};

/**
 * Devuelve el nombre del color para un producto Blackout.
 * Intenta el campo color primero (si es número puro), luego extrae del código BL-00X.
 * Para Velo u otros, devuelve el color original sin transformar.
 */
export function getBlackoutColorName(productCode: string, colorField: string): string {
  // Si el campo color ya es un nombre conocido (Velo), devolverlo tal cual
  const num = colorField.trim();
  if (/^\d+$/.test(num) && BLACKOUT_COLOR_MAP[num]) {
    return BLACKOUT_COLOR_MAP[num];
  }

  // Extraer número del código: BL-001 → 1, BL-008 → 8
  const match = productCode.match(/BL-0*(\d+)/i);
  if (match) {
    const key = String(parseInt(match[1], 10));
    if (BLACKOUT_COLOR_MAP[key]) return BLACKOUT_COLOR_MAP[key];
  }

  // Fallback: devolver el campo original
  return colorField;
}

/** True si el producto es de la categoría Blackout por su código. */
export function isBlackoutProduct(categoryName: string): boolean {
  return categoryName === 'Blackout';
}

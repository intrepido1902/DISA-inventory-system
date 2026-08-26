/**
 * Product family detection utilities for DISA inventory.
 *
 * LSFH family: codes starting with "LSFH" (e.g. LSFH2306-1-280)
 *              or numeric prefix starting with "23" (e.g. 2306-1-280)
 * AS family:   codes starting with "AS"   (e.g. AS2242-1-300)
 *              or numeric prefix starting with "22" (e.g. 2242-1-300)
 *
 * DB codes are NOT changed — detection is pattern-based only.
 */

export type ProductFamily = 'LSFH' | 'AS';

/**
 * Returns the product family for a given product code, or null if unknown.
 * Examples:
 *   "LSFH2306-1-280" → 'LSFH'
 *   "2306-1-280"     → 'LSFH'   (numeric prefix starts with 23)
 *   "AS2242-1-300"   → 'AS'
 *   "2242-1-300"     → 'AS'     (numeric prefix starts with 22)
 */
export function getProductFamily(code: string): ProductFamily | null {
  const seg = code.split('-')[0]; // first segment: "LSFH2306", "2306", "AS2242", "2242"
  if (/^LSFH/i.test(seg) || /^23/.test(seg)) return 'LSFH';
  if (/^AS/i.test(seg) || /^22/.test(seg)) return 'AS';
  return null;
}

/**
 * Returns a Supabase `.or()` filter expression matching product codes for a family.
 *
 * Usage:
 *   const { data } = await db.from('Product').select('id').or(getFamilyOrFilter('LSFH'));
 */
export function getFamilyOrFilter(family: ProductFamily): string {
  if (family === 'LSFH') return 'code.ilike.LSFH%,code.ilike.23%';
  return 'code.ilike.AS%,code.ilike.22%';
}

/**
 * Expands a free-text reference search term into a Supabase `.or()` filter expression
 * on Product.code, recognizing family shorthand — but ONLY when the term is exactly the
 * short family prefix ("lsfh"/"23" or "as"/"22"). Anything else (e.g. "2306", "LSFH2306",
 * "2306-1") is a plain partial match, so searching "2306" doesn't also pull in 2307, 2308…
 *
 * Usage:
 *   const { data } = await db.from('Product').select('id').or(buildCodeFilter(term));
 *
 *   "lsfh" / "23" (exact) → code ILIKE 'LSFH%' OR code ILIKE '23%'
 *   "as"   / "22" (exact) → code ILIKE 'AS%'   OR code ILIKE '22%'
 *   anything else         → code ILIKE '%{term}%'
 */
export function buildCodeFilter(term: string): string {
  const t = term.trim();
  const lower = t.toLowerCase();
  if (lower === 'lsfh' || t === '23') return getFamilyOrFilter('LSFH');
  if (lower === 'as' || t === '22') return getFamilyOrFilter('AS');
  return `code.ilike.%${t}%`;
}

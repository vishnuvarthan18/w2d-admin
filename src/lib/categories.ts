/**
 * The 29 locked wedding business categories (DECISIONS.md §9), verbatim and in
 * that section's order.
 *
 * DELIBERATE DUPLICATE of `w2d-app/constants/listings.ts`. `w2d-admin` is a
 * separate git repo with no npm workspace, path alias, or shared package, so
 * the list cannot be imported — it has to be copied. If §9 ever changes, both
 * copies must change together.
 *
 * Single-select and descriptive only: this field gates nothing, in either
 * codebase. It replaces the old 2-value `userType` (§7), which still exists on
 * documents and is intentionally NOT removed yet.
 */
export type BusinessCategory =
  | 'Banana Tree'
  | 'Green Panthal'
  | 'Welcome Entrance'
  | 'Welcome Girls'
  | 'Welcome Toys'
  | 'Plate Decors'
  | 'Stage Decoration'
  | 'Photography and Videos'
  | 'DJ'
  | 'Catering'
  | 'Bridal Makeup'
  | 'Maalai'
  | 'Iyer'
  | 'Mangala Vathiyam'
  | 'RJ'
  | 'Ice Cream and Beeda'
  | 'Return Gift'
  | 'Honeymoon Trip'
  | 'Psychiatrist for Marriage Counseling'
  | 'Financial Support'
  | 'Costume Rental Service'
  | 'Furniture for Wedding'
  | 'Wedding Dress Materials'
  | 'Ornamental Rental Service'
  | 'New Ornamental Sales'
  | 'Mahal or Mandabam'
  | 'Invitation'
  | 'Audio and Lighting'
  | 'LED Wall';

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  'Banana Tree',
  'Green Panthal',
  'Welcome Entrance',
  'Welcome Girls',
  'Welcome Toys',
  'Plate Decors',
  'Stage Decoration',
  'Photography and Videos',
  'DJ',
  'Catering',
  'Bridal Makeup',
  'Maalai',
  'Iyer',
  'Mangala Vathiyam',
  'RJ',
  'Ice Cream and Beeda',
  'Return Gift',
  'Honeymoon Trip',
  'Psychiatrist for Marriage Counseling',
  'Financial Support',
  'Costume Rental Service',
  'Furniture for Wedding',
  'Wedding Dress Materials',
  'Ornamental Rental Service',
  'New Ornamental Sales',
  'Mahal or Mandabam',
  'Invitation',
  'Audio and Lighting',
  'LED Wall',
];

/**
 * CATEGORY → ROLE MAP (DECISIONS.md §9, restored 2026-08-20 per §0b/§7).
 *
 * SECOND DELIBERATE DUPLICATE, for the same reason as the list above:
 * `w2d-admin` is a separate git repo with no workspace or shared package, so
 * `w2d-app/constants/businessRoles.ts` cannot be imported. If §9's table
 * changes, BOTH copies change together — and `roleMapDrift()` in the mobile
 * repo guards that one, so a change made only here would pass silently.
 *
 * The admin needs this map for one job the mobile app does not: telling ops
 * whether a business's stored `role` still MATCHES what its category implies.
 * A mismatch is either a deliberate correction on one of §9's five "Both" rows
 * or a stale value left behind by a category change — and ops is the only place
 * that distinction can be judged.
 */
export type BusinessRoleValue = 'vendor' | 'manufacturer';

export const BUSINESS_ROLE_MAP: Record<BusinessCategory, BusinessRoleValue> = {
  'Banana Tree': 'manufacturer',
  'Green Panthal': 'manufacturer',
  'Welcome Entrance': 'manufacturer', // §9: Both — default Manufacturer
  'Welcome Girls': 'vendor',
  'Welcome Toys': 'manufacturer',
  'Plate Decors': 'manufacturer',
  'Stage Decoration': 'manufacturer', // §9: Both — default Manufacturer
  'Photography and Videos': 'vendor',
  DJ: 'vendor',
  Catering: 'vendor',
  'Bridal Makeup': 'vendor',
  Maalai: 'manufacturer',
  Iyer: 'vendor',
  'Mangala Vathiyam': 'vendor',
  RJ: 'vendor',
  'Ice Cream and Beeda': 'manufacturer',
  'Return Gift': 'manufacturer',
  'Honeymoon Trip': 'vendor',
  'Psychiatrist for Marriage Counseling': 'vendor',
  'Financial Support': 'vendor',
  'Costume Rental Service': 'manufacturer', // §9: Both — default Manufacturer
  'Furniture for Wedding': 'manufacturer',
  'Wedding Dress Materials': 'manufacturer',
  'Ornamental Rental Service': 'manufacturer',
  'New Ornamental Sales': 'manufacturer',
  'Mahal or Mandabam': 'vendor',
  Invitation: 'manufacturer',
  'Audio and Lighting': 'manufacturer', // §9: Both — default Manufacturer
  'LED Wall': 'manufacturer', // §9: Both — default Manufacturer
};

/** §9's five "Both" rows, where the role is a founder default, not inherent. */
export const AMBIGUOUS_ROLE_CATEGORIES: BusinessCategory[] = [
  'Welcome Entrance',
  'Stage Decoration',
  'Costume Rental Service',
  'Audio and Lighting',
  'LED Wall',
];

/**
 * The role §9 assigns to a category, or null when the category is absent or is
 * not one of the 29 (a legacy 10-item-taxonomy value, for instance).
 *
 * Validates the VALUE rather than trusting the lookup: a plain object literal
 * inherits from Object.prototype, so `map['constructor']` resolves to a truthy
 * function that a `?? null` would happily return. Same guard as the mobile copy.
 */
export function roleForCategory(
  category: string | null | undefined,
): BusinessRoleValue | null {
  if (!category) return null;
  const found = BUSINESS_ROLE_MAP[category as BusinessCategory];
  return found === 'vendor' || found === 'manufacturer' ? found : null;
}

/** Title-case label, matching how §7 writes the two roles. */
export function roleLabel(role: string | null | undefined): string {
  if (role === 'vendor') return 'Vendor';
  if (role === 'manufacturer') return 'Manufacturer';
  return '';
}

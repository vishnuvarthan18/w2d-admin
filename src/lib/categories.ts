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

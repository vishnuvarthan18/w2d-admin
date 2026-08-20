import type { Timestamp } from 'firebase/firestore';

import type { BusinessCategory } from './categories';

/**
 * @deprecated The 2026-08-01 `userType`. Superseded twice over: dropped with
 * the role split on 2026-08-19, and NOT revived by the 2026-08-20 restore —
 * that added a NEW field, `BusinessRole` below (DECISIONS.md §0b: "do not treat
 * this as 'just re-add userType'").
 *
 * Kept because the field still exists on pre-2026-08-19 documents — removal is
 * a separate, not-yet-approved migration. Nothing writes it.
 */
export type UserType = 'vendor' | 'manufacturer';

/**
 * Vendor / Manufacturer (DECISIONS.md §0b, §7 — restored 2026-08-20).
 *
 * Unlike `userType`, this is a REAL permission: `firestore.rules` gates listing
 * and catalog creation on it, symmetrically (§4). Derived from the business's
 * `category` via §9's table on the mobile side; the admin only ever reads it,
 * and corrects it when §9's five "Both" defaults turn out wrong for a specific
 * business (§9, §17).
 */
export type BusinessRole = 'vendor' | 'manufacturer';

/**
 * Soft account flag — suspended users may still sign in, then hit a full
 * lockout screen (`/(auth)/suspended`) with no access past it.
 * createListing also rejects as defense in depth.
 */
export type UserStatus = 'active' | 'suspended';

export type ListingStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'sold'
  | 'unavailable';

export type PostType =
  | 'sell-used'
  | 'sell-new'
  | 'rental'
  | 'requirement'
  | 'catalog';

export interface UserDoc {
  id: string;
  name: string;
  businessName: string;
  /**
   * OPTIONAL, and it always should have been (audit C1). Every account created
   * after 2026-08-19 has no `userType`, so a required type asserted something
   * false — `Users.tsx` only happened not to crash because its render was
   * guarded. Left readable so ops can still spot pre-migration accounts.
   */
  userType?: UserType;
  /**
   * The 29-item business category (§9). Absent on pre-migration documents —
   * render a fallback, never assume it is set.
   */
  category?: BusinessCategory;
  /**
   * Vendor / Manufacturer (§7). Absent on every account created between
   * 2026-08-19 and 2026-08-20; those are what the mobile app's combined
   * confirm screen (§3) is migrating. Optional for exactly that reason —
   * an absent role is a real, expected state, not a data error.
   */
  role?: BusinessRole;
  district: string;
  phone: string;
  categories?: string[];
  createdAt?: Timestamp | null;
  /** Absent on older docs → treat as active. */
  status?: UserStatus;
  /** Soft business verification badge (DECISIONS.md §15). */
  verified?: boolean;
}

export interface ListingDoc {
  id: string;
  createdAt?: Timestamp | null;
  sellerId: string;
  sellerName?: string;
  sellerBusinessName?: string;
  /** @deprecated The 2026-08-01 denormalized role. Pre-2026-08-19 docs only. */
  sellerUserType?: UserType;
  /** Denormalized seller category (§3). Absent on older/legacy docs. */
  sellerCategory?: BusinessCategory;
  /**
   * Denormalized seller role (§3, new 2026-08-20). Absent on every listing
   * created before then — §3 does not backfill, so the moderation queue must
   * render a fallback rather than treat absence as an error.
   */
  sellerRole?: BusinessRole;
  /**
   * When this post drops out of the feeds (§14 item 5, added 2026-08-19).
   * Absent = never expires (D13.3). Audit C3: without this, an expired post
   * looks approved and live in the queue while being invisible to every user.
   */
  expiresAt?: Timestamp | null;
  postType: PostType;
  title: string;
  category: string;
  condition?: string | null;
  price?: number | null;
  quantity?: number | null;
  district: string;
  description: string;
  status: string;
  imageUrls?: string[];
  deliveryOption?: string;
  negotiable?: boolean;
  neededBy?: Timestamp | string | null;
  viewCount?: number;
  interestCount?: number;
}

export interface InterestDoc {
  id: string;
  listingId: string;
  buyerId: string;
  createdAt?: Timestamp | null;
}

export interface ReportDoc {
  id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  createdAt?: Timestamp | null;
  /** Absent / 'open' = pending review; 'resolved' | 'dismissed' after A6. */
  status?: 'open' | 'resolved' | 'dismissed';
}

import type { Timestamp } from 'firebase/firestore';

import type { BusinessCategory } from './categories';

/**
 * @deprecated Superseded by the 29-item `category` field (DECISIONS.md §7, §9).
 * Kept because the field still exists on every document — removal is a
 * separate, not-yet-approved migration.
 */
export type UserType = 'vendor' | 'manufacturer';

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
  userType: UserType;
  /**
   * The 29-item business category (§9). Absent on pre-migration documents —
   * render a fallback, never assume it is set.
   */
  category?: BusinessCategory;
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
  sellerUserType?: UserType;
  /** Denormalized seller category (§3). Absent on older/legacy docs. */
  sellerCategory?: BusinessCategory;
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

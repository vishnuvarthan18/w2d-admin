import type { Timestamp } from 'firebase/firestore';

export type UserType = 'vendor' | 'manufacturer';

/** Soft account flag — suspended users cannot post (mobile createListing check). */
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

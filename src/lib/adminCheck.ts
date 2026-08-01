import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Ops allowlist: `admins/{uid}` marker doc.
 * No custom claims / Admin SDK / Blaze required (ADMIN_DASHBOARD_PLAN stack note).
 */
export async function isAdminUid(uid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'admins', uid));
  return snap.exists();
}

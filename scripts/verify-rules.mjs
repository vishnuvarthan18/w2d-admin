/**
 * Client-SDK rules check (does NOT bypass security rules).
 * Run: node scripts/verify-rules.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  updateDoc,
} from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyBorGtFLbTeK8xSUbLUhYsrd_WZUDsRLLs',
  authDomain: 'wedding2day-a99ea.firebaseapp.com',
  projectId: 'wedding2day-a99ea',
  storageBucket: 'wedding2day-a99ea.firebasestorage.app',
  messagingSenderId: '641763019831',
  appId: '1:641763019831:web:w2dadmin000000000000',
});

const auth = getAuth(app);
const db = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8080);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  const results = [];

  // Non-admin: auth ok, allowlist miss (app layer), and listing update denied by rules.
  const non = await signInWithEmailAndPassword(
    auth,
    'notadmin@wedding2day.local',
    'notadmin-pass-123',
  );
  const nonAdminMarker = await getDoc(doc(db, 'admins', non.user.uid));
  assert(!nonAdminMarker.exists(), 'non-admin marker must be absent');
  let denied = false;
  try {
    await updateDoc(doc(db, 'listings', 'seed-listing-1'), {
      status: 'approved',
    });
  } catch {
    denied = true;
  }
  assert(denied, 'non-admin listing update must be permission-denied');
  results.push('non-admin: allowlist miss + listing update denied: PASS');
  await signOut(auth);

  // Admin: marker exists, can moderate listing + suspend user.
  const adm = await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  const adminMarker = await getDoc(doc(db, 'admins', adm.user.uid));
  assert(adminMarker.exists(), 'admin marker must exist');

  await updateDoc(doc(db, 'listings', 'seed-listing-21'), {
    status: 'approved',
  });
  const listing = await getDoc(doc(db, 'listings', 'seed-listing-21'));
  assert(listing.data()?.status === 'approved', 'admin approve via client SDK');

  await updateDoc(doc(db, 'users', 'seed-user-5'), {
    status: 'suspended',
    verified: true,
  });
  const user = await getDoc(doc(db, 'users', 'seed-user-5'));
  assert(user.data()?.status === 'suspended', 'admin suspend');
  assert(user.data()?.verified === true, 'admin verify');

  // Restore
  await updateDoc(doc(db, 'users', 'seed-user-5'), { status: 'active' });
  results.push('admin: allowlist hit + moderate listing/user: PASS');
  await signOut(auth);

  // Dashboard-ish read of counts as admin
  const adm2 = await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  void adm2;
  const report = await getDoc(
    doc(db, 'reports', 'seed-listing-3_seed-user-4'),
  );
  assert(report.exists(), 'admin can read reports');
  results.push('admin report read: PASS');
  await signOut(auth);

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

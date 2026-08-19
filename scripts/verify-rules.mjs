/**
 * Client-SDK rules check (does NOT bypass security rules).
 * Run: node scripts/verify-rules.mjs
 */

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
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

async function expectAllowed(label, fn) {
  try {
    await fn();
  } catch (err) {
    throw new Error(`ASSERT: ${label} must be ALLOWED — got ${err?.code ?? err}`);
  }
}

async function expectDenied(label, fn) {
  let denied = false;
  try {
    await fn();
  } catch {
    denied = true;
  }
  assert(denied, `${label} must be DENIED`);
}

async function signInOrCreate(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch {
    return await createUserWithEmailAndPassword(auth, email, password);
  }
}

/**
 * Minimal valid `requirement` listing. Rules do not validate the shape, so
 * only `sellerId` and `postType` actually matter to the assertions.
 * `category` uses the 29-item list (DECISIONS.md §9).
 */
function requirementDoc(sellerId) {
  return {
    createdAt: serverTimestamp(),
    sellerId,
    postType: 'requirement',
    title: 'Rules check — requirement post',
    category: 'Catering',
    condition: null,
    price: null,
    quantity: null,
    district: 'Chennai',
    description: 'Created by verify-rules.mjs. Safe to delete.',
    imageUrls: [],
    status: 'pending',
    deliveryOption: null,
    negotiable: false,
    neededBy: null,
    viewCount: 0,
    interestCount: 0,
  };
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

  // ── Requirement creation is open to EVERY business (DECISIONS.md §4, §7) ──
  //
  // The 2026-08-01 rule gated `postType: 'requirement'` creation on
  // `users/{uid}.userType == 'vendor'`. That gate was removed 2026-08-19 —
  // category/role is descriptive, never permission-gating. Cases 1 and 2 prove
  // the gate is gone; cases 3 and 4 prove removing it did NOT loosen the
  // suspension or ownership guards that share the same rule.
  //
  // Profile docs are written by the account itself (rules permit self-create)
  // and suspension is applied by the admin account — no admin-SDK bypass, so
  // every write below is genuinely rules-checked.
  //
  // NOTE: `status` is deliberately omitted from the profile writes. Rules block
  // a user from changing their own status/verified, and isNotSuspended() treats
  // an absent status as active — so omitting it keeps re-runs idempotent.

  const BIZ = [
    { label: 'manufacturer', email: 'rules-mfr@wedding2day.local', userType: 'manufacturer' },
    { label: 'vendor', email: 'rules-vendor@wedding2day.local', userType: 'vendor' },
  ];
  const PASSWORD = 'rules-check-123';
  const uids = {};

  for (const biz of BIZ) {
    const cred = await signInOrCreate(biz.email, PASSWORD);
    uids[biz.label] = cred.user.uid;
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        name: `Rules Check ${biz.label}`,
        businessName: `Rules Check ${biz.label} Co`,
        userType: biz.userType,
        district: 'Chennai',
        phone: '+910000000000',
        categories: [],
      },
      { merge: true },
    );
    await signOut(auth);
  }

  // Case 1 — manufacturer creates a requirement. Was DENIED before the change.
  await signInOrCreate(BIZ[0].email, PASSWORD);
  const mfrReq = doc(db, 'listings', 'rules-check-req-mfr');
  await deleteDoc(mfrReq).catch(() => {});
  await expectAllowed('case 1: manufacturer creates requirement', () =>
    setDoc(mfrReq, requirementDoc(uids.manufacturer)),
  );
  results.push('case 1 — manufacturer CAN create requirement: PASS');

  // Case 4 — ownership guard intact: cannot post as another account.
  await expectDenied('case 4: create with someone else\'s sellerId', () =>
    setDoc(doc(db, 'listings', 'rules-check-req-spoof'), requirementDoc(uids.vendor)),
  );
  results.push('case 4 — sellerId spoof still denied: PASS');
  await deleteDoc(mfrReq).catch(() => {});
  await signOut(auth);

  // Case 2 — vendor creates a requirement. Was allowed before; must stay allowed.
  await signInOrCreate(BIZ[1].email, PASSWORD);
  const vendorReq = doc(db, 'listings', 'rules-check-req-vendor');
  await deleteDoc(vendorReq).catch(() => {});
  await expectAllowed('case 2: vendor creates requirement', () =>
    setDoc(vendorReq, requirementDoc(uids.vendor)),
  );
  results.push('case 2 — vendor CAN still create requirement: PASS');
  await deleteDoc(vendorReq).catch(() => {});
  await signOut(auth);

  // Case 3 — suspension guard intact. Admin suspends, then the account retries.
  const adm3 = await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  void adm3;
  await updateDoc(doc(db, 'users', uids.manufacturer), { status: 'suspended' });
  await signOut(auth);

  await signInOrCreate(BIZ[0].email, PASSWORD);
  await expectDenied('case 3: suspended account creates requirement', () =>
    setDoc(doc(db, 'listings', 'rules-check-req-suspended'), requirementDoc(uids.manufacturer)),
  );
  results.push('case 3 — suspended account still denied: PASS');
  await signOut(auth);

  // Restore so re-runs start clean.
  await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  await updateDoc(doc(db, 'users', uids.manufacturer), { status: 'active' });
  await signOut(auth);

  // ── Public showcase profiles (DECISIONS.md §6a) ──────────────────────────
  //
  // profiles/{slug} is deliberately world-readable: contact info shows
  // directly, NOT reveal-gated like the trade side (§6). These cases prove
  // three things: (a) anonymous read of ONE profile works, (b) anonymous
  // enumeration does NOT — otherwise the public layer becomes a scrapable
  // phone-number directory that §1/§6a rule out, and (c) opening profiles did
  // not leak anything on the trade side (users/listings/catalogItems).

  const PROFILE_SLUG = 'rules-check-profile-x1y2z3';
  const profileRef = doc(db, 'profiles', PROFILE_SLUG);

  function profilePayload(ownerId) {
    return {
      ownerId,
      businessName: 'Rules Check Decorators',
      category: 'Stage Decoration',
      district: 'Chennai',
      phone: '+919000000001',
      whatsapp: '+919000000001',
      photos: ['https://example.invalid/portfolio-1.jpg'],
      slug: PROFILE_SLUG,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  }

  // Owner creates their own profile (pointer on users/{uid} must exist first).
  await signInOrCreate(BIZ[0].email, PASSWORD);
  await deleteDoc(profileRef).catch(() => {});
  await updateDoc(doc(db, 'users', uids.manufacturer), {
    profileSlug: PROFILE_SLUG,
  });
  await expectAllowed('case 5: owner creates own public profile', () =>
    setDoc(profileRef, profilePayload(uids.manufacturer)),
  );
  results.push('case 5 — owner CAN create own profile: PASS');

  // Field allowlist: catalog/pricing data must never reach a public doc (§6a).
  await expectDenied('case 6: profile write with non-allowlisted field', () =>
    setDoc(doc(db, 'profiles', 'rules-check-profile-bad'), {
      ...profilePayload(uids.manufacturer),
      slug: 'rules-check-profile-bad',
      price: 5000,
    }),
  );
  results.push('case 6 — non-allowlisted field (price) denied: PASS');
  await signOut(auth);

  // A DIFFERENT signed-in business must not be able to edit it.
  await signInOrCreate(BIZ[1].email, PASSWORD);
  await expectDenied('case 7: non-owner updates someone else\'s profile', () =>
    updateDoc(profileRef, { phone: '+910000000000' }),
  );
  results.push('case 7 — non-owner CANNOT edit profile: PASS');
  await signOut(auth);

  // ── Everything below runs SIGNED OUT (anonymous visitor) ────────────────
  const anon = await getDoc(profileRef);
  assert(anon.exists(), 'case 8: anonymous get of a profile must succeed');
  assert(
    anon.data()?.phone === '+919000000001',
    'case 8: phone must be readable anonymously (NOT reveal-gated, §6a)',
  );
  results.push('case 8 — anonymous CAN read profile incl. phone: PASS');

  await expectDenied('case 9: anonymous enumeration of profiles', () =>
    getDocs(collection(db, 'profiles')),
  );
  results.push('case 9 — anonymous CANNOT list/enumerate profiles: PASS');

  await expectDenied('case 10: anonymous write to a profile', () =>
    updateDoc(profileRef, { phone: '+910000000000' }),
  );
  results.push('case 10 — anonymous CANNOT write to profile: PASS');

  // Trade side must be untouched by opening up profiles (§6a, §17).
  await expectDenied('case 11: anonymous read of users', () =>
    getDoc(doc(db, 'users', uids.manufacturer)),
  );
  await expectDenied('case 11: anonymous read of listings', () =>
    getDoc(doc(db, 'listings', 'seed-listing-1')),
  );
  await expectDenied('case 11: anonymous read of catalogItems', () =>
    getDoc(doc(db, 'users', 'seed-user-1', 'catalogItems', 'seed-catalog-1')),
  );
  results.push(
    'case 11 — anonymous still BLOCKED on users/listings/catalogItems: PASS',
  );

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

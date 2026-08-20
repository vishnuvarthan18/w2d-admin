/**
 * DEV ONLY — seeds Auth emulator ops accounts + admins/{uid} + light metrics data.
 * Requires Firebase emulators (Auth 9099, Firestore 8080).
 *
 * Run from w2d-admin/: node scripts/seed-admin.mjs
 * Optionally re-seeds mobile listings via ../w2d/scripts/seed.mjs first.
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT_ID = 'wedding2day-a99ea';
const AUTH_BASE = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`;
const FAKE_KEY = 'fake-api-key';

async function ensureAuthUser(email, password) {
  // Try sign-up; if email exists, sign in to get localId.
  const signUpRes = await fetch(
    `${AUTH_BASE}/accounts:signUp?key=${FAKE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signUpBody = await signUpRes.json();
  if (signUpBody.localId) {
    return { uid: signUpBody.localId, idToken: signUpBody.idToken, created: true };
  }

  const signInRes = await fetch(
    `${AUTH_BASE}/accounts:signInWithPassword?key=${FAKE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const signInBody = await signInRes.json();
  if (!signInBody.localId) {
    throw new Error(
      `Could not create/sign-in ${email}: ${JSON.stringify(signUpBody)} / ${JSON.stringify(signInBody)}`,
    );
  }
  return { uid: signInBody.localId, idToken: signInBody.idToken, created: false };
}

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { FieldValue, getFirestore } = await import('firebase-admin/firestore');

  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const admin = await ensureAuthUser('admin@wedding2day.local', 'admin-pass-123');
  const nonAdmin = await ensureAuthUser(
    'notadmin@wedding2day.local',
    'notadmin-pass-123',
  );

  // admins/{uid} marker — only admin gets this.
  await db.collection('admins').doc(admin.uid).set({
    email: 'admin@wedding2day.local',
    createdAt: FieldValue.serverTimestamp(),
    role: 'ops',
  });

  // Sample interests + open report so dashboard metrics aren't all zeros.
  // Uses seed listing/user ids from mobile scripts/seed.mjs when present.
  const interestRef = db.collection('interests').doc('seed-listing-1_seed-user-2');
  await interestRef.set({
    listingId: 'seed-listing-1',
    buyerId: 'seed-user-2',
    createdAt: FieldValue.serverTimestamp(),
  });

  const reportRef = db.collection('reports').doc('seed-listing-3_seed-user-4');
  await reportRef.set({
    listingId: 'seed-listing-3',
    reporterId: 'seed-user-4',
    reason: 'Spam / wrong category (admin seed)',
    status: 'open',
    createdAt: FieldValue.serverTimestamp(),
  });

  // Ensure a couple of seed users have explicit status/verified for A3 tests.
  //
  // NOTE: this script deliberately does NOT write `category` or `role` onto
  // `seed-user-*` (DECISIONS.md §9, §7). Those values are owned solely by
  // `w2d-app/scripts/seed.mjs`; writing them here too would duplicate the same
  // fixture across two repos and let the two drift — exactly the risk C5
  // already flags for the duplicated category list.
  await db.collection('users').doc('seed-user-1').set(
    { status: 'active', verified: false },
    { merge: true },
  );
  await db.collection('users').doc('seed-user-3').set(
    { status: 'active', verified: true },
    { merge: true },
  );

  // ── Role fixtures, admin-OWNED (§7, §11 — 2026-08-20) ──────────────────
  //
  // Separate `admin-seed-*` ids rather than merges onto `seed-user-*`, for the
  // reason above: these are wholly this script's, so there is nothing to drift
  // against. They exist so the Users screen's role filter and the Dashboard's
  // role tile have data to show even when `w2d-app/scripts/seed.mjs` has not
  // been run in this emulator — the admin repo has to be verifiable on its own.
  //
  // All three states are represented on purpose. The `null`-role row is the one
  // that matters most for ops: it is what a real pre-migration account looks
  // like (§3), and the admin UI has to render it without a badge rather than
  // crash or invent one.
  const ROLE_FIXTURES = [
    {
      id: 'admin-seed-manufacturer',
      name: 'Role Fixture Mfr',
      businessName: 'Fixture Furniture Works',
      category: 'Furniture for Wedding', // §9 row 22 → Manufacturer
      role: 'manufacturer',
      district: 'Madurai',
    },
    {
      id: 'admin-seed-vendor',
      name: 'Role Fixture Vendor',
      businessName: 'Fixture Catering Co',
      category: 'Catering', // §9 row 10 → Vendor
      role: 'vendor',
      district: 'Coimbatore',
    },
    {
      id: 'admin-seed-norole',
      name: 'Role Fixture Pre-migration',
      businessName: 'Fixture Unmigrated Traders',
      category: null,
      role: null,
      district: 'Chennai',
    },
  ];

  for (const fixture of ROLE_FIXTURES) {
    await db.collection('users').doc(fixture.id).set(
      {
        name: fixture.name,
        businessName: fixture.businessName,
        category: fixture.category,
        role: fixture.role,
        district: fixture.district,
        phone: '+91900000' + fixture.id.length.toString().padStart(4, '0'),
        status: 'active',
        verified: false,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        admin: {
          email: 'admin@wedding2day.local',
          password: 'admin-pass-123',
          uid: admin.uid,
          created: admin.created,
        },
        nonAdmin: {
          email: 'notadmin@wedding2day.local',
          password: 'notadmin-pass-123',
          uid: nonAdmin.uid,
          created: nonAdmin.created,
          note: 'No admins/{uid} — sign-in must be rejected by app',
        },
        seeded: [
          'admins',
          'interests sample',
          'reports sample',
          'user flags',
          'role fixtures (manufacturer / vendor / pre-migration)',
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error('seed-admin failed:', err);
  process.exit(1);
});

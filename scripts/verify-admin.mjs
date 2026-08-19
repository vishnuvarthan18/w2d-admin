/**
 * Automated verification for A1–A4 (emulator only).
 * Run: node scripts/verify-admin.mjs
 */

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const PROJECT_ID = 'wedding2day-a99ea';
const AUTH_BASE = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1`;
const FAKE_KEY = 'fake-api-key';

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function signIn(email, password) {
  const res = await fetch(
    `${AUTH_BASE}/accounts:signInWithPassword?key=${FAKE_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await res.json();
  if (!body.localId) throw new Error(`signIn failed for ${email}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  const results = [];

  // --- A1.2 allowlist ---
  const admin = await signIn('admin@wedding2day.local', 'admin-pass-123');
  const nonAdmin = await signIn('notadmin@wedding2day.local', 'notadmin-pass-123');
  const adminDoc = await db.collection('admins').doc(admin.localId).get();
  const nonAdminDoc = await db.collection('admins').doc(nonAdmin.localId).get();
  assert(adminDoc.exists, 'admin must have admins/{uid}');
  assert(!nonAdminDoc.exists, 'non-admin must NOT have admins/{uid}');
  results.push('A1.2 allowlist docs: PASS');

  // --- A2.1 metrics match Firestore ---
  const [users, listings, interests, reports] = await Promise.all([
    db.collection('users').get(),
    db.collection('listings').get(),
    db.collection('interests').get(),
    db.collection('reports').get(),
  ]);
  const pending = listings.docs.filter((d) => d.data().status === 'pending');
  const vendors = users.docs.filter((d) => d.data().userType === 'vendor');
  const manufacturers = users.docs.filter(
    (d) => d.data().userType === 'manufacturer',
  );
  assert(users.size === 8, `expected 8 users, got ${users.size}`);
  assert(listings.size === 25, `expected 25 listings, got ${listings.size}`);
  assert(pending.length >= 1, `expected ≥1 pending, got ${pending.length}`);
  // Legacy role split — `userType` is superseded by `category` (§7, §9) but is
  // intentionally still written, so this assertion still holds during migration.
  assert(vendors.length === 4 && manufacturers.length === 4, 'role split 4/4');
  // Migration state: seed.mjs deliberately categorises some users and leaves
  // the rest absent, so both the populated and fallback paths get exercised.
  const categorised = users.docs.filter((d) => Boolean(d.data().category));
  assert(
    categorised.length > 0 && categorised.length < users.size,
    `expected a MIX of categorised/uncategorised seed users, got ${categorised.length}/${users.size}`,
  );
  assert(interests.size >= 1, 'expected ≥1 interest');
  assert(reports.size >= 1, 'expected ≥1 report');
  results.push(
    `A2.1 metrics: PASS (users=${users.size} v=${vendors.length}/m=${manufacturers.length} categorised=${categorised.length} listings=${listings.size} pending=${pending.length} interests=${interests.size} reports=${reports.size})`,
  );

  // --- A3.2 suspend/verify ---
  const targetUser = 'seed-user-1';
  await db.collection('users').doc(targetUser).set(
    { status: 'suspended', verified: true },
    { merge: true },
  );
  const afterSuspend = await db.collection('users').doc(targetUser).get();
  assert(afterSuspend.data().status === 'suspended', 'suspend flag');
  assert(afterSuspend.data().verified === true, 'verified flag');
  await db.collection('users').doc(targetUser).set(
    { status: 'active' },
    { merge: true },
  );
  results.push('A3.2 suspend/verify writes: PASS');

  // --- A4.1 approve/reject ---
  // Prefer a still-pending doc; if prior runs cleared them, reset one first.
  let pendingId = pending[0]?.id;
  let pendingId2 = pending[1]?.id;
  if (!pendingId) {
    pendingId = 'seed-listing-23';
    await db.collection('listings').doc(pendingId).update({ status: 'pending' });
  }
  if (!pendingId2 || pendingId2 === pendingId) {
    pendingId2 = 'seed-listing-24';
    await db.collection('listings').doc(pendingId2).update({ status: 'pending' });
  }
  await db.collection('listings').doc(pendingId).update({ status: 'approved' });
  await db.collection('listings').doc(pendingId2).update({
    status: 'rejected',
    rejectionReason: 'verify-admin script',
  });
  const a = await db.collection('listings').doc(pendingId).get();
  const r = await db.collection('listings').doc(pendingId2).get();
  assert(a.data().status === 'approved', 'approve');
  assert(r.data().status === 'rejected', 'reject');
  results.push(`A4.1 approve/reject: PASS (${pendingId} approved, ${pendingId2} rejected)`);

  // --- A4.2 takedown ---
  const approvedLive = (await db.collection('listings').get()).docs.find(
    (d) => d.data().status === 'approved',
  );
  assert(approvedLive, 'need an approved listing for takedown');
  await db.collection('listings').doc(approvedLive.id).update({
    status: 'unavailable',
    takedownReason: 'admin_takedown',
  });
  const t = await db.collection('listings').doc(approvedLive.id).get();
  assert(t.data().status === 'unavailable', 'takedown');
  // Feed filter in mobile fetchListings: pending|approved only — unavailable hidden.
  results.push(`A4.2 takedown: PASS (${approvedLive.id} → unavailable)`);

  // Restore for a cleaner emulator state (optional nicety)
  await db.collection('listings').doc(approvedLive.id).update({ status: 'approved' });

  console.log(JSON.stringify({ ok: true, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

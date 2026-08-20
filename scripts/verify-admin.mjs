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

  // Scoped to the `seed-` prefix rather than counting the whole collection.
  // `verify-rules.mjs` leaves its own `rules-check-*` fixture users and
  // listings behind in the same emulator, so a bare `users.size === 8` passes
  // on a fresh emulator and fails on every run after — which is exactly the
  // kind of flake that gets a verification script ignored.
  const seedUsers = users.docs.filter((d) => d.id.startsWith('seed-user-'));
  const seedListings = listings.docs.filter((d) =>
    d.id.startsWith('seed-listing-'),
  );
  assert(seedUsers.length === 8, `expected 8 seed users, got ${seedUsers.length}`);
  assert(
    seedListings.length === 25,
    `expected 25 seed listings, got ${seedListings.length}`,
  );
  assert(pending.length >= 1, `expected ≥1 pending, got ${pending.length}`);

  // HISTORY, because this assertion has now been rewritten twice and the next
  // reader should not have to guess which model it is on:
  //   * originally `vendors === 4 && manufacturers === 4`, read from
  //     `users.userType` — the 2026-08-01 role model;
  //   * then a category-only MIX check, after the role split was dropped on
  //     2026-08-19 and `userType` stopped being written by anything;
  //   * now a category AND role MIX check, because the role split is back as a
  //     NEW field, `role` (DECISIONS.md §0b, §7, restored 2026-08-20).
  //
  // `userType` stays asserted at ZERO. That is the part that must not be
  // inverted: §0b is explicit that the restore is not a revival of `userType`,
  // so anything writing it again is a regression, not a migration.
  //
  // The MIX shape is what both checks are really for: the admin UI has a
  // populated path and a fallback path for each field, and a fixture set that
  // is all-populated or all-empty silently exercises only one of them.
  const legacyRoles = seedUsers.filter((d) => 'userType' in d.data()).length;
  const categorised = seedUsers.filter((d) => Boolean(d.data().category));
  const roled = seedUsers.filter((d) => Boolean(d.data().role));
  assert(
    categorised.length > 0 && categorised.length < seedUsers.length,
    `expected a MIX of categorised/uncategorised seed users, got ${categorised.length}/${seedUsers.length}`,
  );
  assert(
    roled.length > 0 && roled.length < seedUsers.length,
    `expected a MIX of seed users with/without a role (§7), got ${roled.length}/${seedUsers.length}`,
  );
  assert(
    legacyRoles === 0,
    `expected NO seed user to carry the retired userType field (§0b), got ${legacyRoles}`,
  );
  // Both roles must be present, or the Users screen's role filter has nothing
  // to distinguish and a filter that returns everything looks like it works.
  const vendors = seedUsers.filter((d) => d.data().role === 'vendor').length;
  const manufacturers = seedUsers.filter(
    (d) => d.data().role === 'manufacturer',
  ).length;
  assert(
    vendors > 0 && manufacturers > 0,
    `expected both roles among seed users (§7), got vendor=${vendors} manufacturer=${manufacturers}`,
  );

  // Every seeded listing that HAS a role tag must be consistent with §4's
  // table: requirements are Vendor-posted, supply listings Manufacturer-posted.
  // An untagged listing is legitimate (§3 does not backfill), so it is skipped
  // rather than failed.
  const misTagged = seedListings.filter((d) => {
    const data = d.data();
    if (!data.sellerRole) return false;
    return data.postType === 'requirement'
      ? data.sellerRole !== 'vendor'
      : data.sellerRole !== 'manufacturer';
  });
  assert(
    misTagged.length === 0,
    `expected no seed listing to contradict §4's role table, got ${misTagged.length} (${misTagged
      .map((d) => d.id)
      .join(', ')})`,
  );

  assert(interests.size >= 1, 'expected ≥1 interest');
  assert(reports.size >= 1, 'expected ≥1 report');
  results.push(
    `A2.1 metrics: PASS (seedUsers=${seedUsers.length} categorised=${categorised.length}/${seedUsers.length} roled=${roled.length}/${seedUsers.length} vendor=${vendors} manufacturer=${manufacturers} legacyUserType=${legacyRoles} seedListings=${seedListings.length} pending=${pending.length} interests=${interests.size} reports=${reports.size})`,
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

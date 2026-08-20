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
  terminate,
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

/**
 * A supply listing (§4: sell-used / sell-new / rental), the other half of the
 * symmetric role gate restored on 2026-08-20 (§0b, §7).
 *
 * The old version of this script only ever created requirements, because the
 * 2026-08-01 gate only restricted requirements. Symmetric gating means the
 * supply direction now needs its own fixture — a role model tested in one
 * direction only is exactly the half-verified state §0's accuracy correction
 * found last time.
 */
function supplyDoc(sellerId, postType = 'sell-used') {
  return {
    createdAt: serverTimestamp(),
    sellerId,
    postType,
    title: `Rules check — ${postType} post`,
    category: 'Furniture for Wedding',
    condition: postType === 'sell-new' ? 'New' : 'Used - Good',
    price: 4500,
    quantity: 2,
    district: 'Chennai',
    description: 'Created by verify-rules.mjs. Safe to delete.',
    imageUrls: [],
    status: 'pending',
    deliveryOption: 'both',
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

  // ── SYMMETRIC role gate on listing creation (§0b, §4, §7) ───────────────
  //
  // This block has been inverted twice, so here is the whole history:
  //   * 2026-08-01: `postType: 'requirement'` required
  //     `users/{uid}.userType == 'vendor'`. Nothing gated supply listings.
  //   * 2026-08-19: that gate was REMOVED. This script then asserted the
  //     ABSENCE of a role gate — case 1 proved a "manufacturer" COULD create a
  //     requirement.
  //   * 2026-08-20: the gate is BACK, as a new field (`role`, not `userType`)
  //     and symmetric in both directions. Case 1's assertion is therefore
  //     INVERTED below, and two new cases cover the supply direction the old
  //     model never gated at all.
  //
  // The labels are real again: these fixtures genuinely carry `role`, and their
  // categories are the ones §9's table maps to that role.
  //
  // Cases 3 and 4 exist to prove the restored gate did not swallow the
  // suspension and ownership guards that share the same rule — a create can be
  // denied for three separate reasons now, so each case is arranged so only ONE
  // of them applies.
  //
  // Profile docs are written by the account itself (rules permit self-create)
  // and suspension is applied by the admin account — no admin-SDK bypass, so
  // every write below is genuinely rules-checked.
  //
  // NOTE: `status` is deliberately omitted from the profile writes. Rules block
  // a user from changing their own status/verified, and isNotSuspended() treats
  // an absent status as active — so omitting it keeps re-runs idempotent.
  const BIZ = [
    {
      label: 'manufacturer',
      email: 'rules-mfr@wedding2day.local',
      // §9 row 28: Audio and Lighting → Both, default Manufacturer.
      category: 'Audio and Lighting',
      role: 'manufacturer',
    },
    {
      label: 'vendor',
      email: 'rules-vendor@wedding2day.local',
      // §9 row 10: Catering → Vendor. The previous fixture used 'Stage
      // Decoration' for its "vendor", which §9 maps to Manufacturer — harmless
      // while the label meant nothing, wrong now that it does.
      category: 'Catering',
      role: 'vendor',
    },
    {
      // A third business that exists ONLY to be a subject nobody ever holds a
      // grant for (§6). It is needed because reveal grants are UNDELETABLE by
      // design — that immutability is what stops a grant being dropped and
      // re-minted for free — so a script cannot clean one up afterwards.
      //
      // Without this fixture, "reading a contact document with no grant is
      // denied" passed on a fresh emulator and FAILED on every run after, since
      // the grant minted two cases later was still there. That is precisely the
      // flake shape that gets a verification script quietly ignored, and it is
      // the second time this file has had one.
      label: 'ungranted',
      email: 'rules-ungranted@wedding2day.local',
      category: 'Furniture for Wedding',
      role: 'manufacturer',
    },
  ];
  const PASSWORD = 'rules-check-123';
  const uids = {};

  /**
   * UTC day key for the daily-cap counters — must match `dayKey()` in
   * `w2d-app/constants/rateLimits.ts` and `todayKey()` in `firestore.rules`.
   */
  const todayKey = () => {
    const now = new Date();
    return String(
      now.getUTCFullYear() * 10000 +
        (now.getUTCMonth() + 1) * 100 +
        now.getUTCDate(),
    );
  };

  for (const biz of BIZ) {
    const cred = await signInOrCreate(biz.email, PASSWORD);
    uids[biz.label] = cred.user.uid;
    await setDoc(
      doc(db, 'users', cred.user.uid),
      {
        name: `Rules Check ${biz.label}`,
        businessName: `Rules Check ${biz.label} Co`,
        category: biz.category,
        // The field the restored gate reads (§7). Without it every create below
        // is denied by the role check before reaching the rule under test — an
        // absent role fails BOTH sides of the symmetric gate.
        role: biz.role,
        district: 'Chennai',
        // NO `phone` here — §6 moved it to users/{uid}/contact/info on
        // 2026-08-20. Written separately below so these fixtures match the
        // shape the app now produces.
      },
      { merge: true },
    );
    await setDoc(
      doc(db, 'users', cred.user.uid, 'contact', 'info'),
      { phone: '+910000000000', updatedAt: serverTimestamp() },
      { merge: true },
    );
    // Creating a listing now requires today's rate-limit counter to exist and
    // be under cap (§6, §14 item 6). Without it the fixtures below are denied
    // before any of the rules actually under test are reached.
    //
    // Written exactly the way the app writes it, and for the same reasons:
    //  * `posts: 1`, not `0` — the rules refuse to create a counter recording
    //    no action at all (the sum must be exactly 1), because a client able
    //    to write a zeroed counter could also reset one. So this is a real
    //    first-post-of-the-day. One charged post leaves ample headroom for the
    //    handful of listings this script creates.
    //  * create ONLY when absent — an update that changes nothing has
    //    `affectedKeys().size() == 0` and is denied by the "exactly one
    //    counter moved by one" rule. Re-running the script must not fail on
    //    its own leftovers.
    const counterRef = doc(
      db,
      'users',
      cred.user.uid,
      'rateLimits',
      todayKey(),
    );
    const counterSnap = await getDoc(counterRef);
    if (!counterSnap.exists()) {
      await setDoc(counterRef, { reveals: 0, posts: 1, reports: 0 });
    }
    await signOut(auth);
  }

  // Case 1 — INVERTED 2026-08-20. A Manufacturer may NOT raise a requirement.
  // This assertion read `expectAllowed` under the 2026-08-19 no-role model;
  // §4's table now makes `requirement` Vendor-only, in both directions.
  await signInOrCreate(BIZ[0].email, PASSWORD);
  const mfrReq = doc(db, 'listings', 'rules-check-req-mfr');
  await deleteDoc(mfrReq).catch(() => {});
  await expectDenied('case 1: manufacturer creates requirement', () =>
    setDoc(mfrReq, requirementDoc(uids.manufacturer)),
  );
  results.push('case 1 — manufacturer CANNOT create requirement (§7): PASS');

  // Case 1b — the same account CAN create a supply listing. Without this, case
  // 1 would also pass if the rules simply denied that account everything.
  const mfrSupply = doc(db, 'listings', 'rules-check-supply-mfr');
  await deleteDoc(mfrSupply).catch(() => {});
  await expectAllowed('case 1b: manufacturer creates supply listing', () =>
    setDoc(mfrSupply, supplyDoc(uids.manufacturer)),
  );
  results.push('case 1b — manufacturer CAN create supply listing (§7): PASS');

  // Case 4 — ownership guard intact: cannot post as another account. Uses a
  // SUPPLY doc so the role gate would pass for this signed-in Manufacturer and
  // the only thing left to deny it is the sellerId mismatch.
  await expectDenied("case 4: create with someone else's sellerId", () =>
    setDoc(doc(db, 'listings', 'rules-check-supply-spoof'), supplyDoc(uids.vendor)),
  );
  results.push('case 4 — sellerId spoof still denied: PASS');
  await deleteDoc(mfrSupply).catch(() => {});
  await signOut(auth);

  // Case 2 — vendor creates a requirement. Allowed under the 2026-08-01 model,
  // allowed under the 2026-08-19 model, allowed now: the one case all three
  // versions of §7 agree on.
  await signInOrCreate(BIZ[1].email, PASSWORD);
  const vendorReq = doc(db, 'listings', 'rules-check-req-vendor');
  await deleteDoc(vendorReq).catch(() => {});
  await expectAllowed('case 2: vendor creates requirement', () =>
    setDoc(vendorReq, requirementDoc(uids.vendor)),
  );
  results.push('case 2 — vendor CAN create requirement (§7): PASS');

  // Case 2b — the other new half of the symmetry: a Vendor may NOT post supply.
  // Nothing gated this direction under either previous model.
  await expectDenied('case 2b: vendor creates supply listing', () =>
    setDoc(doc(db, 'listings', 'rules-check-supply-vendor'), supplyDoc(uids.vendor)),
  );
  results.push('case 2b — vendor CANNOT create supply listing (§7): PASS');
  await deleteDoc(vendorReq).catch(() => {});
  await signOut(auth);

  // Case 3 — suspension guard intact. Suspends the VENDOR and retries the one
  // create that account is otherwise entitled to make, so suspension is the
  // ONLY reason left for the denial. (Previously this suspended the
  // manufacturer and retried a requirement — now denied by role as well, which
  // would make the case prove nothing about suspension.)
  const adm3 = await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  void adm3;
  await updateDoc(doc(db, 'users', uids.vendor), { status: 'suspended' });
  await signOut(auth);

  await signInOrCreate(BIZ[1].email, PASSWORD);
  await expectDenied('case 3: suspended vendor creates requirement', () =>
    setDoc(
      doc(db, 'listings', 'rules-check-req-suspended'),
      requirementDoc(uids.vendor),
    ),
  );
  results.push('case 3 — suspended account still denied: PASS');
  await signOut(auth);

  // Restore so re-runs start clean.
  await signInWithEmailAndPassword(
    auth,
    'admin@wedding2day.local',
    'admin-pass-123',
  );
  await updateDoc(doc(db, 'users', uids.vendor), { status: 'active' });
  await signOut(auth);

  // Case 12 — catalog is MANUFACTURER-EXCLUSIVE (§4, §7). The 2026-08-19 model
  // opened it to everyone; this asserts the reversal, in both directions.
  // Numbered 12, not 5: the public-profile block below already owns cases 5-11,
  // and two different "case 5"s in one output is how a failing case gets
  // attributed to the wrong assertion.
  const catalogItem = {
    createdAt: serverTimestamp(),
    title: 'Rules check — catalog item',
    category: 'Furniture for Wedding',
    price: 2500,
    description: 'Created by verify-rules.mjs. Safe to delete.',
    imageUrls: [],
  };

  await signInOrCreate(BIZ[0].email, PASSWORD);
  const mfrCatalog = doc(
    db,
    'users',
    uids.manufacturer,
    'catalogItems',
    'rules-check-catalog-mfr',
  );
  await deleteDoc(mfrCatalog).catch(() => {});
  await expectAllowed('case 12: manufacturer creates catalog item', () =>
    setDoc(mfrCatalog, catalogItem),
  );
  await deleteDoc(mfrCatalog).catch(() => {});
  await signOut(auth);
  results.push('case 12 — manufacturer CAN create catalog item (§4): PASS');

  await signInOrCreate(BIZ[1].email, PASSWORD);
  await expectDenied('case 12b: vendor creates catalog item', () =>
    setDoc(
      doc(db, 'users', uids.vendor, 'catalogItems', 'rules-check-catalog-vendor'),
      catalogItem,
    ),
  );
  await signOut(auth);
  results.push('case 12b — vendor CANNOT create catalog item (§4): PASS');

  // ── Reveal grants: the phone-enumeration fix (§6, 2026-08-20) ───────────
  //
  // Worth covering here as well as in `w2d-app/tests/rules.test.mjs`, because
  // this script signs in as real Auth users against the real emulator, so it
  // exercises the same rules through a different client and a different auth
  // path. This is the most security-sensitive change of the 2026-08-20 pass.
  await signInOrCreate(BIZ[0].email, PASSWORD);

  // Case 13 — a signed-in account can still read another business's user
  // document (it must: the reveal screen and the responders list need the
  // identity), and that is now harmless because the number is not in it.
  const otherUserRef = doc(db, 'users', uids.vendor);
  const otherUserSnap = await getDoc(otherUserRef);
  assert(
    otherUserSnap.exists(),
    'case 13: expected to be able to read another user document',
  );
  assert(
    !('phone' in (otherUserSnap.data() ?? {})),
    'case 13: users/{uid} still carries a `phone` field — the enumeration gap is reopened',
  );
  results.push('case 13 — users/{uid} carries no phone: PASS');

  // Case 13b — without a grant, the contact document is unreadable. This is the
  // step that used to hand over a number for free.
  //
  // Reads the `ungranted` fixture, NOT the vendor: case 13c below mints a grant
  // for the vendor, and grants cannot be deleted, so re-using the same subject
  // made this assertion pass once and fail forever after. See BIZ[2]'s note.
  await expectDenied('case 13b: read a contact document with no grant', () =>
    getDoc(doc(db, 'users', uids.ungranted, 'contact', 'info')),
  );
  results.push('case 13b — no grant, no number: PASS');

  // Case 13c — with a grant, the number is readable. Minted by the viewer, as
  // the app does, so the create rule is genuinely exercised rather than
  // bypassed with the Admin SDK.
  //
  // The mint is CONDITIONAL, and that is forced by the design rather than a
  // shortcut: a grant is immutable, so a re-`setDoc` on an existing one is an
  // `update` and is denied — correctly, since a grant that could be rewritten
  // would be a second number for free. This script cannot clear it (grants are
  // undeletable too), so on a second run against the same emulator the grant is
  // simply already there.
  //
  // What that costs, stated plainly: on a re-run this case verifies the READ
  // but not the CREATE. The create is verified from scratch on every run by
  // `w2d-app/tests/rules.test.mjs`, which calls `clearFirestore()` before each
  // test and covers the cap gate, the id/payload match, self-grants, extra
  // fields and suspension. This script's distinct value is exercising the same
  // rules through a real Auth client, and the read assertion below does that
  // unconditionally.
  const grantRef = doc(
    db,
    'revealGrants',
    `${uids.vendor}_${uids.manufacturer}`,
  );
  const alreadyGranted = await getDoc(
    doc(db, 'users', uids.vendor, 'contact', 'info'),
  ).then(
    () => true,
    () => false,
  );
  if (!alreadyGranted) {
    await expectAllowed('case 13c: mint own reveal grant', () =>
      setDoc(grantRef, {
        subjectId: uids.vendor,
        viewerId: uids.manufacturer,
        createdAt: serverTimestamp(),
      }),
    );
  }
  await expectAllowed('case 13c: read the contact document with a grant', () =>
    getDoc(doc(db, 'users', uids.vendor, 'contact', 'info')),
  );
  results.push(
    'case 13c — grant unlocks exactly one number: PASS' +
      (alreadyGranted ? ' (grant carried over from an earlier run)' : ''),
  );

  // Case 13d — a grant cannot be minted on someone else's behalf, and cannot be
  // deleted and re-minted (which would be a second number for free).
  await expectDenied('case 13d: mint a grant for a third party', () =>
    setDoc(doc(db, 'revealGrants', `${uids.ungranted}_third-party-uid`), {
      subjectId: uids.ungranted,
      viewerId: 'third-party-uid',
      createdAt: serverTimestamp(),
    }),
  );
  await expectDenied('case 13d: delete an existing grant', () =>
    deleteDoc(grantRef),
  );
  results.push('case 13d — grants are self-only and immutable: PASS');

  // Case 13e — a peer with a grant has READ on that one document, never write.
  await expectDenied("case 13e: write another business's contact document", () =>
    setDoc(doc(db, 'users', uids.vendor, 'contact', 'info'), {
      phone: '+919999999999',
    }),
  );
  results.push('case 13e — a grant is read access only: PASS');
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
      // §6a, 2026-08-20: `role` is now on the public-profile field allowlist.
      // Including it here is what proves the allowlist actually admits it —
      // a payload that omitted the new field would pass either way.
      role: 'manufacturer',
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

/**
 * Shuts the SDK down so a PASSING run actually returns.
 *
 * Without this the script hung forever on success while exiting cleanly on
 * failure — the worst possible arrangement, and it makes `npm run verify`
 * unusable in a script or in CI. The Firestore SDK holds open gRPC streams and
 * Auth holds a token-refresh timer, so node has live handles and never exits on
 * its own; `terminate()` closes the Firestore ones and the explicit exit covers
 * the rest.
 */
async function shutdown() {
  try {
    await signOut(auth);
  } catch {
    // Already signed out, or the emulator went away. Not worth failing over.
  }
  try {
    await terminate(db);
  } catch {
    // Same.
  }
}

main()
  .then(async () => {
    await shutdown();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await shutdown();
    process.exit(1);
  });

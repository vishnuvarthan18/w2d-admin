import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  AMBIGUOUS_ROLE_CATEGORIES,
  BUSINESS_CATEGORIES,
  roleForCategory,
  roleLabel,
} from '../lib/categories';
import type {
  BusinessRole,
  ListingDoc,
  UserDoc,
  UserStatus,
} from '../lib/types';

const DISTRICTS_FILTER = 'all';
const CATEGORY_FILTER = 'all';
/** Accounts with no `category` yet — the ones needing migration (§3). */
const CATEGORY_NONE = 'none';

const ROLE_FILTER = 'all';
/**
 * Accounts with no `role` yet (§7, §3). Ops' single most useful view during the
 * 2026-08-20 migration: an account with no role can create NOTHING, because the
 * symmetric rule gates deny both directions on an absent field. This filter is
 * how you see who is still stuck.
 */
const ROLE_NONE = 'none';
/**
 * Accounts whose stored `role` disagrees with what their `category` implies via
 * §9's table.
 *
 * Not necessarily an error — §9 calls its five "Both" defaults correctable per
 * business, so a deliberate ops correction lands here too. What matters is that
 * ops can SEE the set, since the other cause is a stale role left behind by a
 * category change, and only a human can tell the two apart.
 */
const ROLE_MISMATCH = 'mismatch';

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function UsersPage() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [listings, setListings] = useState<ListingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(CATEGORY_FILTER);
  const [role, setRole] = useState<string>(ROLE_FILTER);
  const [district, setDistrict] = useState<string>(DISTRICTS_FILTER);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /*
        `phone` moved OUT of `users/{uid}` on 2026-08-20 and into
        `users/{uid}/contact/info`, behind a per-pair reveal grant (§6). That
        closed the enumeration gap in the mobile app — a signed-in account could
        previously harvest numbers one user document at a time, straight past
        §6's daily reveal cap.

        The admin still needs numbers: ops answers support calls that arrive BY
        phone, so the search box has to match on one. A collection-group query
        gets all of them in ONE read instead of an N+1 walk, and the rules allow
        it for `isAdmin()` only. An admin already had `list` on `users` and `get`
        on every contact document, so this is convenience, not new capability.
      */
      const [usersSnap, listingsSnap, contactsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'listings')),
        getDocs(collectionGroup(db, 'contact')),
      ]);

      // Keyed by the OWNER's uid, which is the contact document's grandparent —
      // `users/{uid}/contact/info`, so `ref.parent.parent.id`.
      const phones = new Map<string, string>();
      for (const d of contactsSnap.docs) {
        const ownerId = d.ref.parent.parent?.id;
        if (ownerId) {
          phones.set(ownerId, (d.data().phone as string | undefined) ?? '');
        }
      }

      setUsers(
        usersSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            ...data,
            // The contact document wins. A `phone` still on `users/{uid}` means
            // an account the §6 migration has not reached yet
            // (`w2d-app/scripts/migrate-contacts.mjs`), and ops should see the
            // number either way rather than a blank row.
            phone: phones.get(d.id) ?? (data.phone as string | undefined) ?? '',
          } as UserDoc;
        }),
      );
      setListings(
        listingsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ListingDoc),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeListingCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of listings) {
      if (l.status === 'pending' || l.status === 'approved') {
        map.set(l.sellerId, (map.get(l.sellerId) ?? 0) + 1);
      }
    }
    return map;
  }, [listings]);

  /**
   * Surfaced in the header, not buried in a filter: during the §3 migration this
   * number IS the migration's progress, and every account in it is one that can
   * currently post nothing at all.
   */
  const noRoleCount = useMemo(
    () => users.filter((u) => !u.role).length,
    [users],
  );

  const districts = useMemo(() => {
    return [...new Set(users.map((u) => u.district).filter(Boolean))].sort();
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (category === CATEGORY_NONE) {
        if (u.category) return false;
      } else if (category !== CATEGORY_FILTER && u.category !== category) {
        return false;
      }
      if (role === ROLE_NONE) {
        if (u.role) return false;
      } else if (role === ROLE_MISMATCH) {
        // Only meaningful when BOTH fields are present: an account with no role
        // belongs to ROLE_NONE, and one with no category has nothing to compare
        // against, so neither is a "mismatch".
        const implied = roleForCategory(u.category);
        if (!u.role || !implied || implied === u.role) return false;
      } else if (role !== ROLE_FILTER && u.role !== role) {
        return false;
      }
      if (district !== DISTRICTS_FILTER && u.district !== district) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.businessName.toLowerCase().includes(q) ||
        (u.phone ?? '').includes(q)
      );
    });
  }, [users, search, category, role, district]);

  async function setUserStatus(userId: string, status: UserStatus) {
    setBusyId(userId);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, 'users', userId), { status });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status } : u)),
      );
      setActionMsg(
        status === 'suspended'
          ? `Suspended ${userId} — full lockout on next mobile session (suspended screen).`
          : `Unsuspended ${userId}.`,
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function setVerified(userId: string, verified: boolean) {
    setBusyId(userId);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, 'users', userId), { verified });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, verified } : u)),
      );
      setActionMsg(
        verified
          ? `Verified badge on for ${userId}.`
          : `Verified badge off for ${userId}.`,
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Sets a business's role directly (§7, §9, §17).
   *
   * This is the per-business correction path §9 leaves open for its five "Both"
   * rows, and it deliberately lives ONLY here. The mobile app never offers a
   * role picker, because §7 is explicit that a business does not choose its own
   * role — but §9 also calls its own defaults "a first draft… correctable", and
   * an uncorrectable first draft is not really a draft. Ops is the right place:
   * a human weighs the case, and the change is auditable.
   *
   * ⚠️ This changes what the account can POST. Firestore rules read
   * `users/{uid}.role` for the symmetric create gate (§4), so flipping it takes
   * away one set of post types and grants the other. Hence the confirmation.
   *
   * `category` is deliberately NOT touched. Rewriting the category to match
   * would change the business's public identity (§6a) to fix a permission — and
   * would also clobber the denormalized copies on its listings without the
   * backfill the mobile editor performs.
   */
  async function setUserRole(user: UserDoc, next: BusinessRole) {
    const implied = roleForCategory(user.category);
    const warning =
      implied && implied !== next
        ? `\n\nNote: §9 maps "${user.category}" to ${roleLabel(implied)}. ` +
          'This will be a deliberate exception — log it in DECISIONS.md §17.'
        : '';
    const confirmed = window.confirm(
      `Change ${user.businessName || user.id} to ${roleLabel(next)}?\n\n` +
        'This changes what they can post: Vendors post requirements only; ' +
        'Manufacturers post sell/rental listings and keep a catalog.' +
        warning,
    );
    if (!confirmed) return;

    setBusyId(user.id);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, 'users', user.id), { role: next });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: next } : u)),
      );
      setActionMsg(
        `${user.id} is now a ${roleLabel(next)}. Their existing listings keep ` +
          'their old sellerRole tag — §3 does not backfill, and the Needs-tab ' +
          'filter treats a mismatched tag as visible rather than hiding posts.',
      );
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="muted">Loading users…</p>;
  if (error) return <div className="alert danger">{error}</div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p className="muted">
          {filtered.length} shown · {users.length} total · {noRoleCount} with no
          role yet
        </p>
      </header>

      {actionMsg && <div className="alert info">{actionMsg}</div>}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name, business, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value={CATEGORY_FILTER}>All categories</option>
          <option value={CATEGORY_NONE}>Uncategorised</option>
          {BUSINESS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value={ROLE_FILTER}>All roles</option>
          <option value="vendor">Vendor</option>
          <option value="manufacturer">Manufacturer</option>
          <option value={ROLE_NONE}>No role (needs migration)</option>
          <option value={ROLE_MISMATCH}>Role ≠ category default</option>
        </select>
        <select value={district} onChange={(e) => setDistrict(e.target.value)}>
          <option value={DISTRICTS_FILTER}>All districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <button type="button" className="btn ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Business</th>
              <th>Category</th>
              <th>Role</th>
              <th>District</th>
              <th>Phone</th>
              <th>Joined</th>
              <th>Active listings</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const suspended = u.status === 'suspended';
              const verified = Boolean(u.verified);
              const impliedRole = roleForCategory(u.category);
              const roleMismatch = Boolean(
                u.role && impliedRole && impliedRole !== u.role,
              );
              const ambiguousCategory = AMBIGUOUS_ROLE_CATEGORIES.includes(
                u.category as never,
              );
              return (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {verified && <span className="badge ok">Verified</span>}
                  </td>
                  <td>{u.businessName}</td>
                  <td>
                    {u.category ?? <span className="muted">—</span>}
                    {/* The RETIRED 2026-08-01 field, kept visible purely as a
                        "this account predates the migrations" marker (§0b). It
                        is not the `role` column beside it and must not be
                        confused with it — hence the explicit label. */}
                    {u.userType && (
                      <span className="badge muted">
                        legacy userType: {u.userType}
                      </span>
                    )}
                    {ambiguousCategory && (
                      <span className="badge muted" title={'§9 marks this category "Both" — its role is a founder-assigned default, correctable per business.'}>
                        role default
                      </span>
                    )}
                  </td>
                  <td>
                    {u.role ? (
                      roleLabel(u.role)
                    ) : (
                      /* An absent role is not cosmetic: the symmetric rule
                         gates deny this account EVERY create until the mobile
                         confirm screen (§3) runs. Flagged, not dashed. */
                      <span className="badge danger" title="No role — this account cannot post anything until it confirms one (§3, §7).">
                        none
                      </span>
                    )}
                    {roleMismatch && (
                      <span className="badge warn" title={`§9 maps "${u.category}" to ${roleLabel(impliedRole)}. Either a deliberate correction (§17) or a stale value after a category change.`}>
                        ≠ {roleLabel(impliedRole)}
                      </span>
                    )}
                  </td>
                  <td>{u.district}</td>
                  <td>{u.phone || '—'}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{activeListingCount.get(u.id) ?? 0}</td>
                  <td>
                    <span className={suspended ? 'badge danger' : 'badge ok'}>
                      {suspended ? 'suspended' : 'active'}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="btn small"
                      disabled={busyId === u.id}
                      onClick={() =>
                        void setUserStatus(
                          u.id,
                          suspended ? 'active' : 'suspended',
                        )
                      }
                    >
                      {suspended ? 'Unsuspend' : 'Suspend'}
                    </button>
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busyId === u.id}
                      onClick={() => void setVerified(u.id, !verified)}
                    >
                      {verified ? 'Unverify' : 'Verify'}
                    </button>
                    {/*
                      Two explicit buttons rather than one "toggle", because the
                      target must be unambiguous for an account that currently
                      has NO role — a toggle would have to guess a starting
                      point, and the guess would be a permission (§7).
                    */}
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busyId === u.id || u.role === 'vendor'}
                      onClick={() => void setUserRole(u, 'vendor')}
                    >
                      → Vendor
                    </button>
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busyId === u.id || u.role === 'manufacturer'}
                      onClick={() => void setUserRole(u, 'manufacturer')}
                    >
                      → Mfr
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="muted">
                  No users match
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

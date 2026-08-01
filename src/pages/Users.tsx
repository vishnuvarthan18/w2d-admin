import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ListingDoc, UserDoc, UserStatus } from '../lib/types';

const DISTRICTS_FILTER = 'all';
const TYPES_FILTER = 'all';

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
  const [userType, setUserType] = useState<string>(TYPES_FILTER);
  const [district, setDistrict] = useState<string>(DISTRICTS_FILTER);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersSnap, listingsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'listings')),
      ]);
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDoc));
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

  const districts = useMemo(() => {
    return [...new Set(users.map((u) => u.district).filter(Boolean))].sort();
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (userType !== TYPES_FILTER && u.userType !== userType) return false;
      if (district !== DISTRICTS_FILTER && u.district !== district) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.businessName.toLowerCase().includes(q) ||
        (u.phone ?? '').includes(q)
      );
    });
  }, [users, search, userType, district]);

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

  if (loading) return <p className="muted">Loading users…</p>;
  if (error) return <div className="alert danger">{error}</div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Users</h1>
        <p className="muted">{filtered.length} shown · {users.length} total</p>
      </header>

      {actionMsg && <div className="alert info">{actionMsg}</div>}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name, business, phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={userType} onChange={(e) => setUserType(e.target.value)}>
          <option value={TYPES_FILTER}>All roles</option>
          <option value="vendor">Vendor</option>
          <option value="manufacturer">Manufacturer</option>
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
              return (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {verified && <span className="badge ok">Verified</span>}
                  </td>
                  <td>{u.businessName}</td>
                  <td>{u.userType}</td>
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
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
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

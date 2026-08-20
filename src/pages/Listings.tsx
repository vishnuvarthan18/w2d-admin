import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { roleLabel } from '../lib/categories';
import type { ListingDoc, ListingStatus } from '../lib/types';

type StatusFilter = 'all' | 'pending' | ListingStatus | string;

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleString('en-IN');
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'approved'
      ? 'badge ok'
      : status === 'pending'
        ? 'badge warn'
        : status === 'rejected' || status === 'unavailable'
          ? 'badge danger'
          : 'badge';
  return <span className={cls}>{status}</span>;
}

interface ListingsPageProps {
  /** When set, lock the view to this postType (used by Requirements stub). */
  forcedPostType?: string;
  title?: string;
}

export function ListingsPage({
  forcedPostType,
  title = 'Listings',
}: ListingsPageProps) {
  const [listings, setListings] = useState<ListingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    forcedPostType ? 'all' : 'pending',
  );
  const [postTypeFilter, setPostTypeFilter] = useState<string>(
    forcedPostType ?? 'all',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'listings'));
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as ListingDoc,
      );
      rows.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      setListings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (forcedPostType && l.postType !== forcedPostType) return false;
      if (!forcedPostType && postTypeFilter !== 'all' && l.postType !== postTypeFilter) {
        return false;
      }
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        (l.sellerName ?? '').toLowerCase().includes(q) ||
        (l.sellerBusinessName ?? '').toLowerCase().includes(q) ||
        l.district.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q)
      );
    });
  }, [listings, search, statusFilter, postTypeFilter, forcedPostType]);

  const selected = listings.find((l) => l.id === selectedId) ?? null;

  async function setStatus(
    listingId: string,
    status: ListingStatus,
    extra?: Record<string, unknown>,
  ) {
    setBusyId(listingId);
    setActionMsg(null);
    try {
      await updateDoc(doc(db, 'listings', listingId), {
        status,
        ...extra,
      });
      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, status, ...extra } : l,
        ),
      );
      setActionMsg(`Listing ${listingId} → ${status}`);
    } catch (err) {
      setActionMsg(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="muted">Loading listings…</p>;
  if (error) return <div className="alert danger">{error}</div>;

  return (
    <div className="page">
      <header className="page-header">
        <h1>{title}</h1>
        <p className="muted">
          {filtered.length} shown · {listings.length} total in Firestore
        </p>
      </header>

      {actionMsg && <div className="alert info">{actionMsg}</div>}

      <div className="toolbar">
        <input
          className="search"
          placeholder="Search title, seller, district, id…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="unavailable">Unavailable (takedown)</option>
          <option value="sold">Sold</option>
        </select>
        {!forcedPostType && (
          <select
            value={postTypeFilter}
            onChange={(e) => setPostTypeFilter(e.target.value)}
          >
            <option value="all">All post types</option>
            <option value="sell-used">sell-used</option>
            <option value="sell-new">sell-new</option>
            <option value="rental">rental</option>
            <option value="requirement">requirement</option>
            <option value="catalog">catalog</option>
          </select>
        )}
        <button type="button" className="btn ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="split">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>District</th>
                <th>Seller</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr
                  key={l.id}
                  className={selectedId === l.id ? 'row-selected' : undefined}
                  onClick={() => setSelectedId(l.id)}
                >
                  <td>{l.title}</td>
                  <td>{l.postType}</td>
                  <td>
                    <StatusPill status={l.status} />
                  </td>
                  <td>{l.district}</td>
                  <td>{l.sellerBusinessName || l.sellerName || l.sellerId}</td>
                  <td>{formatDate(l.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No listings match
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="detail-panel">
          {!selected && (
            <p className="muted">Select a listing to review details and act.</p>
          )}
          {selected && (
            <>
              <h2>{selected.title}</h2>
              <p className="muted tiny">{selected.id}</p>
              <StatusPill status={selected.status} />
              <dl className="detail-list">
                <div>
                  <dt>Post type</dt>
                  <dd>{selected.postType}</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{selected.category}</dd>
                </div>
                <div>
                  <dt>Seller role</dt>
                  <dd>
                    {/*
                      §3, 2026-08-20: the denormalized `sellerRole`. Worth
                      surfacing in the moderation queue because it is what makes
                      a post legitimate under §4 — a `requirement` tagged
                      `manufacturer` (or the reverse) can only be a pre-restore
                      post, since the rules now refuse to create one.
                      Absent on every listing made before 2026-08-20; §3 does
                      not backfill, so "—" is expected, not a fault.
                    */}
                    {roleLabel(selected.sellerRole) || (
                      <span className="muted">— (pre-2026-08-20 post)</span>
                    )}
                    {selected.sellerRole &&
                      (selected.postType === 'requirement'
                        ? selected.sellerRole !== 'vendor'
                        : selected.sellerRole !== 'manufacturer') && (
                        <span
                          className="badge warn"
                          title="This post's type and seller role contradict §4's table. Only possible for a post made while the gate was open (2026-08-19–20)."
                        >
                          contradicts §4
                        </span>
                      )}
                  </dd>
                </div>
                <div>
                  <dt>District</dt>
                  <dd>{selected.district}</dd>
                </div>
                <div>
                  <dt>Price</dt>
                  <dd>
                    {selected.price == null
                      ? '—'
                      : `₹${selected.price.toLocaleString('en-IN')}`}
                  </dd>
                </div>
                <div>
                  <dt>Condition</dt>
                  <dd>{selected.condition ?? '—'}</dd>
                </div>
                <div>
                  <dt>Seller</dt>
                  <dd>
                    {selected.sellerName ?? '—'}
                    {selected.sellerBusinessName
                      ? ` · ${selected.sellerBusinessName}`
                      : ''}
                    <br />
                    <span className="muted tiny">{selected.sellerId}</span>
                  </dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{selected.description || '—'}</dd>
                </div>
              </dl>

              {selected.imageUrls && selected.imageUrls.length > 0 && (
                <div className="photo-grid">
                  {selected.imageUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="photo-thumb"
                    >
                      <img src={url} alt="" />
                    </a>
                  ))}
                </div>
              )}

              <div className="action-stack">
                {selected.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={busyId === selected.id}
                      onClick={() =>
                        void setStatus(selected.id, 'approved')
                      }
                    >
                      Approve
                    </button>
                    <label className="field">
                      <span>Reject reason (stored; silent to user until push infra)</span>
                      <input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Optional reason"
                      />
                    </label>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busyId === selected.id}
                      onClick={() =>
                        void setStatus(selected.id, 'rejected', {
                          rejectionReason: rejectReason.trim() || null,
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
                {(selected.status === 'approved' ||
                  selected.status === 'pending') && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busyId === selected.id}
                    onClick={() =>
                      void setStatus(selected.id, 'unavailable', {
                        takedownReason: 'admin_takedown',
                      })
                    }
                  >
                    Takedown (unavailable)
                  </button>
                )}
                {selected.status === 'unavailable' && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyId === selected.id}
                    onClick={() => void setStatus(selected.id, 'approved')}
                  >
                    Restore to approved
                  </button>
                )}
                {selected.status === 'rejected' && (
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyId === selected.id}
                    onClick={() => void setStatus(selected.id, 'approved')}
                  >
                    Approve (override reject)
                  </button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

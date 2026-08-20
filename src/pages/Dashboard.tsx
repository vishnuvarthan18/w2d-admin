import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  type Timestamp,
} from 'firebase/firestore';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db } from '../lib/firebase';
import type { InterestDoc, ListingDoc, ReportDoc, UserDoc } from '../lib/types';

interface DayBucket {
  day: string;
  signups: number;
  posts: number;
}

function toDate(value: Timestamp | null | undefined): Date | null {
  if (!value || typeof value.toDate !== 'function') return null;
  return value.toDate();
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

export function DashboardPage() {
  const [users, setUsers] = useState<UserDoc[]>([]);
  const [listings, setListings] = useState<ListingDoc[]>([]);
  const [interests, setInterests] = useState<InterestDoc[]>([]);
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [usersSnap, listingsSnap, interestsSnap, reportsSnap] =
          await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'listings')),
            getDocs(collection(db, 'interests')),
            getDocs(collection(db, 'reports')),
          ]);
        if (cancelled) return;
        setUsers(
          usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as UserDoc),
        );
        setListings(
          listingsSnap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as ListingDoc,
          ),
        );
        setInterests(
          interestsSnap.docs.map(
            (d) => ({ id: d.id, ...d.data() }) as InterestDoc,
          ),
        );
        setReports(
          reportsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as ReportDoc),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load metrics');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    // Two migrations, tracked separately, because they are two fields and an
    // account can be through one and not the other (§0b, §3):
    //   * `category` — the 29-item list, migrated 2026-08-19 (§9);
    //   * `role` — Vendor/Manufacturer, restored 2026-08-20 (§7).
    //
    // The role split is BACK, but this is deliberately NOT the old
    // vendor/manufacturer count read from `userType`: that field is retired and
    // nothing writes it (§0b). `noRole` is the number that matters most for ops
    // — those accounts can create nothing at all, because the symmetric rule
    // gates deny both directions on an absent role.
    const categorised = users.filter((u) => Boolean(u.category)).length;
    const uncategorised = users.length - categorised;
    const vendors = users.filter((u) => u.role === 'vendor').length;
    const manufacturers = users.filter(
      (u) => u.role === 'manufacturer',
    ).length;
    const noRole = users.length - vendors - manufacturers;
    const byType: Record<string, number> = {};
    for (const l of listings) {
      byType[l.postType] = (byType[l.postType] ?? 0) + 1;
    }
    const pendingPosts = listings.filter((l) => l.status === 'pending').length;
    const reportsPending = reports.filter(
      (r) => !r.status || r.status === 'open',
    ).length;

    const days = lastNDays(30);
    const signupMap = new Map(days.map((d) => [d, 0]));
    const postMap = new Map(days.map((d) => [d, 0]));
    for (const u of users) {
      const d = toDate(u.createdAt ?? null);
      if (!d) continue;
      const k = dayKey(d);
      if (signupMap.has(k)) signupMap.set(k, (signupMap.get(k) ?? 0) + 1);
    }
    for (const l of listings) {
      const d = toDate(l.createdAt ?? null);
      if (!d) continue;
      const k = dayKey(d);
      if (postMap.has(k)) postMap.set(k, (postMap.get(k) ?? 0) + 1);
    }
    const series: DayBucket[] = days.map((day) => ({
      day: day.slice(5),
      signups: signupMap.get(day) ?? 0,
      posts: postMap.get(day) ?? 0,
    }));

    const supplyTypes = new Set(['sell-used', 'sell-new', 'rental', 'catalog']);
    const districtMap = new Map<
      string,
      { district: string; supply: number; demand: number }
    >();
    const categoryMap = new Map<
      string,
      { category: string; supply: number; demand: number }
    >();

    for (const l of listings) {
      const isDemand = l.postType === 'requirement';
      const dEntry = districtMap.get(l.district) ?? {
        district: l.district,
        supply: 0,
        demand: 0,
      };
      if (isDemand) dEntry.demand += 1;
      else if (supplyTypes.has(l.postType)) dEntry.supply += 1;
      districtMap.set(l.district, dEntry);

      const cEntry = categoryMap.get(l.category) ?? {
        category: l.category,
        supply: 0,
        demand: 0,
      };
      if (isDemand) cEntry.demand += 1;
      else if (supplyTypes.has(l.postType)) cEntry.supply += 1;
      categoryMap.set(l.category, cEntry);
    }

    const districts = [...districtMap.values()].sort(
      (a, b) => b.supply + b.demand - (a.supply + a.demand),
    );
    const categories = [...categoryMap.values()].sort(
      (a, b) => b.supply + b.demand - (a.supply + a.demand),
    );

    return {
      totalUsers: users.length,
      categorised,
      uncategorised,
      vendors,
      manufacturers,
      noRole,
      byType,
      totalInterests: interests.length,
      pendingPosts,
      reportsPending,
      series,
      districts,
      categories,
    };
  }, [users, listings, interests, reports]);

  if (loading) {
    return <p className="muted">Loading dashboard…</p>;
  }

  if (error) {
    return <div className="alert danger">{error}</div>;
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Funnel dashboard</h1>
        <p className="muted">
          Client-side aggregates from Firestore (no BigQuery yet).
        </p>
      </header>

      <section className="metric-grid">
        <article className="metric-card">
          <p className="muted tiny">Users</p>
          <strong>{metrics.totalUsers}</strong>
          <p className="muted tiny">
            {metrics.categorised} categorised · {metrics.uncategorised} uncategorised
          </p>
        </article>
        <article className="metric-card">
          <p className="muted tiny">Roles (§7)</p>
          <strong>
            {metrics.vendors} / {metrics.manufacturers}
          </strong>
          <p className="muted tiny">
            vendor / manufacturer
            {metrics.noRole > 0 ? ` · ${metrics.noRole} with NO role` : ''}
          </p>
        </article>
        <article className="metric-card">
          <p className="muted tiny">Posts</p>
          <strong>{listings.length}</strong>
          <p className="muted tiny">
            {Object.entries(metrics.byType)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ') || 'none'}
          </p>
        </article>
        <article className="metric-card">
          <p className="muted tiny">Interests</p>
          <strong>{metrics.totalInterests}</strong>
        </article>
        <article className="metric-card">
          <p className="muted tiny">Pending approval</p>
          <strong>{metrics.pendingPosts}</strong>
        </article>
        <article className="metric-card">
          <p className="muted tiny">Reports open</p>
          <strong>{metrics.reportsPending}</strong>
        </article>
      </section>

      <section className="panel">
        <h2>Last 30 days</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={metrics.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e2dc" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="signups" fill="#1f6b4a" name="Signups" />
              <Bar dataKey="posts" fill="#c45c26" name="Posts" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>District supply vs demand</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>District</th>
                <th>Supply</th>
                <th>Demand</th>
              </tr>
            </thead>
            <tbody>
              {metrics.districts.map((row) => (
                <tr key={row.district}>
                  <td>{row.district}</td>
                  <td>{row.supply}</td>
                  <td>{row.demand}</td>
                </tr>
              ))}
              {metrics.districts.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No listings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Category supply vs demand</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Supply</th>
                <th>Demand</th>
              </tr>
            </thead>
            <tbody>
              {metrics.categories.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.supply}</td>
                  <td>{row.demand}</td>
                </tr>
              ))}
              {metrics.categories.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    No listings yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV: { to: string; label: string; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/users', label: 'Users' },
  { to: '/listings', label: 'Listings' },
  { to: '/requirements', label: 'Requirements' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const { user, signOutAdmin } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W2D</span>
          <div>
            <strong>Admin</strong>
            <p className="muted tiny">Ops console</p>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'nav-link active' : 'nav-link'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="muted tiny truncate">{user?.email}</p>
          <button type="button" className="btn ghost" onClick={() => void signOutAdmin()}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="muted">Stub — ops prefs / allowlist management later.</p>
      </header>
      <div className="panel">
        <h2>Admin allowlist</h2>
        <p>
          Marker docs live at <code>admins/{'{uid}'}</code>. Create ops Auth
          users (email/password) via Firebase Console or{' '}
          <code>scripts/seed-admin.mjs</code>, then write the marker doc. No
          self-serve signup.
        </p>
        <h2>Emulators</h2>
        <p className="muted">
          Dev connects to Auth :9099 and Firestore :8080 (same as mobile app).
        </p>
      </div>
    </div>
  );
}

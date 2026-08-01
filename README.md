# W2D Admin

Ops dashboard for Wedding2day. Sibling project to the mobile app (`../w2d`).
Same Firebase project: `wedding2day-a99ea`.

## Stack

- Vite + React + TypeScript
- Firebase Web SDK (Auth email/password + Firestore)
- React Router
- Recharts (funnel charts)

## Dev

Emulators must be running from the mobile repo (Auth 9099, Firestore 8080):

```bash
# from ../w2d
npx firebase emulators:start --only firestore,auth,storage --project wedding2day-a99ea
node scripts/seed.mjs
```

Then:

```bash
cd ../w2d-admin
npm install
node scripts/seed-admin.mjs   # creates admin@wedding2day.local + allowlist
npm run dev
```

Default ops login (emulator only):

- Email: `admin@wedding2day.local`
- Password: `admin-pass-123`

Non-allowlisted test account: `notadmin@wedding2day.local` / `notadmin-pass-123`
(should see "Not authorized").

## Scope tonight

A1–A4 (scaffold, auth, dashboard, users, listing moderation). A5–A7 deferred.

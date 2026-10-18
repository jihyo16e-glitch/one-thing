# One Thing

A calm phone app for one job: do ONE thing a day.

- Plan tomorrow at night: one ONE thing and at most 3 small tasks.
- Today shows your ONE thing first. Focus mode keeps you on it.
- Decide: 7 fixed questions turn a stuck decision into one action.
- Talk: tap the mic and say "remind me tomorrow at 11 AM to call the bank". Fixed sentence rules understand it. No AI, no account, no server.
- Your data stays on your phone. Export a backup file any time.

## Get it

- **Android app (APK):** download `one-thing.apk` from the [latest release](../../releases/latest) on your phone, open it, tap Install.
- **Web app:** https://one-thing-xi.vercel.app (install it from Chrome).

## Build

Vite 5 + React 18 + TypeScript, packaged for Android with Capacitor 8.

```
npm ci
npm run build          # web app in dist/
npx cap sync android   # copy it into android/
```

The APK is built and signed in GitHub Actions (`.github/workflows/android.yml`) on every push to `main`.

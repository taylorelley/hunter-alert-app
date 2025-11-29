# Hunter Alert App

## Overview
Hunter Alert is a mobile-first application built with React, Next.js, and Capacitor, specifically tuned for constrained networks such as satellite links. The app features native network monitoring plugins for Android and iOS that detect satellite connections, constrained networks, and optimize data usage accordingly. The repository includes Supabase backend assets (schema, security policies, and RPC functions) alongside the mobile client.

## Backend setup
1. Install the Supabase CLI: `npm install -g supabase`.
2. Copy environment variables: `cp backend/.env.example backend/.env` and fill in your project values.
3. Start a local stack: `supabase start` (from the `backend` directory if you prefer a clean context).
4. Apply the schema: `supabase db reset` or `supabase db push` to run `backend/supabase/migrations/0001_init.sql`.
5. Run backend checks: `npm run lint --prefix backend` to validate the migration and env sample are present.
6. RPCs are defined in SQL and exposed by Supabase as `send_message_batch` and `pull_updates` with built-in batch size limits.

## Frontend development
- `pnpm dev` (or `npm run dev`) to start the Next.js development server.
- `pnpm build` (or `npm run build`) to create a production build.
- `pnpm start` (or `npm run start`) to serve the production build.
- `pnpm lint` (or `npm run lint`) to run lint checks.
- `pnpm test` to execute Vitest unit tests (including the Supabase wrapper and offline queue/sync state machine).
- `pnpm test:coverage` for a coverage report.

## Mobile App (Capacitor)

### Prerequisites
- Node.js 20+
- pnpm
- Java 17+ (for Android builds)
- Android SDK (for Android)
- Xcode (for iOS, macOS only)
- CocoaPods (for iOS, macOS only)

### Setup and Build

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

3. **Build the web app:**
   ```bash
   pnpm build
   ```

4. **Sync with native platforms:**
   ```bash
   npx cap sync
   ```

5. **Open in native IDE:**
   ```bash
   # Android Studio
   npx cap open android

   # Xcode (macOS only)
   npx cap open ios
   ```

6. **Run on device:**
   ```bash
   # Android
   npx cap run android

   # iOS (macOS only)
   npx cap run ios
   ```

### Native Network Monitoring

The app includes custom Capacitor plugins for advanced network detection:

- **Android**: Detects satellite networks (API 31+), constrained networks, and removes bandwidth constraints from NetworkRequest
- **iOS**: Uses NWPathMonitor to detect constrained and expensive paths, includes carrier-constrained entitlements
- **Web**: Falls back to Network Information API for browser development

Network states detected:
- `connectivity`: offline | wifi | cellular | satellite
- `constrained`: Low-data mode or bandwidth-constrained network
- `ultraConstrained`: Satellite or both constrained + expensive
- `expensive`: Metered/cellular connection

See `docs/capacitor-setup.md` for detailed information about the native plugins.

## CI/CD

### GitHub Actions

The repository includes automated Android APK builds via GitHub Actions:

- **Trigger**: Push to `main` branch
- **Process**: Builds Next.js app → Syncs Capacitor → Builds APK
- **Output**: Creates GitHub release with APK artifact

See `.github/workflows/build-android.yml` for the complete workflow.

## Documentation
- `docs/api.md` documents RPC payloads and expected responses.
- `docs/network-modes.md` describes how the client should adapt requests in normal, satellite, and offline modes.
- `docs/capacitor-setup.md` explains the Capacitor setup and native network plugins.
- `docs/testing.md` describes the testing approach and strategy.

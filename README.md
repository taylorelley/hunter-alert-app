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

### Constrained network configuration

- The `scripts/validate-env.mjs` validator runs automatically before `dev`, `build`, and `start` to ensure constrained-network environment variables are present and within safe ranges. Missing values are defaulted and clamped to sane bounds for satellite use.
- Required connectivity variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Defaults for constrained-friendly tuning (override via env):
  - `BACKEND_MAX_MESSAGE_BATCH` (default 20, range 1-20)
  - `BACKEND_MAX_PULL_LIMIT` (default 100, range 10-200)
  - `SYNC_NORMAL_BATCH_LIMIT` (default 10, range 1-20)
  - `SYNC_SATELLITE_BATCH_LIMIT` (default 5, range 1-20)
  - `SYNC_ULTRA_BATCH_LIMIT` (default 3, range 1-20)
  - `SYNC_BASE_BACKOFF_MS` (default 5000, range 1000-60000)

- Admin/debug visibility: set `NEXT_PUBLIC_ENABLE_ADMIN_DEBUG=true` to render the configuration panel inside the profile screen (defaults to hidden for end users).

## Mobile App (Capacitor)

### Prerequisites
- Node.js 20+
- pnpm
- Java 21+ (for Android builds - required by Capacitor 7)
- Android SDK (for Android) - **Requires Android 14+ (API 34+)** for satellite network support
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

- **Android**: Detects satellite networks, constrained networks, and removes bandwidth constraints from NetworkRequest (requires Android 14+/API 34+)
- **iOS**: Uses NWPathMonitor to detect constrained and expensive paths, includes carrier-constrained entitlements
- **Web**: Falls back to Network Information API for browser development

Network states detected:
- `connectivity`: offline | wifi | cellular | satellite
- `constrained`: Low-data mode or bandwidth-constrained network
- `ultraConstrained`: Satellite or both constrained + expensive
- `expensive`: Metered/cellular connection

See `docs/capacitor-setup.md` for detailed information about the native plugins.

## Deployment

### Web Deployment

Since the app uses Next.js with static export (`output: 'export'`), it can be deployed to any static hosting service:

**Vercel** (recommended for Next.js):
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

**Netlify**:
```bash
# Build command: pnpm build
# Publish directory: out

# Using Netlify CLI
npm i -g netlify-cli
netlify deploy --prod
```

**Other Static Hosts** (GitHub Pages, AWS S3, Cloudflare Pages, etc.):
```bash
pnpm build
# Upload contents of `out/` directory to your host
```

**Environment Variables**:
Ensure these are set in your hosting platform:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `NEXT_PUBLIC_WEATHER_API_KEY` - OpenWeatherMap API key (optional, for weather features)

For local testing before deployment, set these in `.env.local` (see [Frontend development](#frontend-development) section).

### Backend Deployment (Supabase)

**Deploy to Supabase Cloud**:

1. **Create a Supabase project**:
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Link your local project**:
   ```bash
   cd backend
   # your-project-ref is the alphanumeric ID from your Supabase project URL
   # e.g., 'abcdefghijklmnop' from https://abcdefghijklmnop.supabase.co
   supabase link --project-ref your-project-ref
   ```

3. **Push migrations**:
   ```bash
   supabase db push
   ```

4. **Verify deployment**:
   - Check tables in Supabase dashboard
   - Verify RLS policies are enabled
   - Test RPC functions in SQL editor

**Configure authentication**:
- Enable email/password auth in Supabase dashboard (Authentication > Providers)
- Configure email templates if needed
- Set up OAuth providers (optional)

### Mobile App Deployment

#### Android (Google Play)

1. **Generate signing key**:
   ```bash
   # Generate a release keystore (if you don't have one)
   keytool -genkey -v -keystore release.keystore \
     -alias hunter-alert -keyalg RSA -keysize 2048 -validity 10000

   # IMPORTANT: Keep this keystore file secure and NEVER commit it to git!
   # Store it in a safe location outside the repository
   ```

2. **Configure signing for local builds**:

   Create `android/gradle.properties` (ignored by git) with:
   ```properties
   RELEASE_KEYSTORE_FILE=/path/to/your/release.keystore
   RELEASE_KEYSTORE_PASSWORD=your-keystore-password
   RELEASE_KEY_ALIAS=hunter-alert
   RELEASE_KEY_PASSWORD=your-key-password
   ```

3. **Configure GitHub Actions for automated builds**:

   The APK signing is already configured in `build.gradle`. To enable signed APK builds in GitHub Actions:

   a. **Encode your keystore to base64**:
   ```bash
   # Linux
   base64 -w 0 release.keystore > keystore.txt

   # macOS
   base64 -i release.keystore -o keystore.txt

   # Copy the contents of keystore.txt
   ```

   b. **Add GitHub Secrets** (Repository Settings → Secrets and variables → Actions):
   - `RELEASE_KEYSTORE_BASE64`: Paste the base64-encoded keystore content
   - `RELEASE_KEYSTORE_PASSWORD`: Your keystore password
   - `RELEASE_KEY_ALIAS`: `hunter-alert` (or your chosen alias)
   - `RELEASE_KEY_PASSWORD`: Your key password

   c. **Existing secrets** (already required):
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key

   Once configured, GitHub Actions will automatically build and sign APKs on push to `main`.

4. **Build release APK/AAB locally**:
   ```bash
   # Build web app with production config
   pnpm build

   # Sync to Android
   npx cap sync android

   # Open in Android Studio
   npx cap open android

   # In Android Studio:
   # Build > Generate Signed Bundle / APK
   # Choose "Android App Bundle" (AAB) for Play Store
   ```

5. **Upload to Google Play Console**:
   - Create app listing at [play.google.com/console](https://play.google.com/console)
   - Upload AAB file
   - Complete store listing (screenshots, description, privacy policy)
   - Submit for review

**Requirements**:
- Minimum SDK: API 34 (Android 14+)
- Target SDK: API 34+
- Google Play Developer account ($25 one-time fee)

#### iOS (App Store)

1. **Configure signing** in Xcode:
   ```bash
   # Open project
   npx cap open ios
   ```
   - Select project in navigator
   - Go to "Signing & Capabilities"
   - Select your Apple Developer team
   - Choose automatic or manual provisioning

2. **Add required entitlements**:
   - Network carrier-constrained entitlement (for satellite detection)
   - Location services (for GPS features)
   - Background modes (if needed for geofencing)

3. **Build for release**:
   ```bash
   # Build web app with production config
   pnpm build

   # Sync to iOS
   npx cap sync ios

   # Open in Xcode
   npx cap open ios

   # In Xcode:
   # Product > Archive
   # Distribute App > App Store Connect
   ```

4. **Upload to App Store Connect**:
   - Create app listing at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   - Upload IPA via Xcode or Transporter app
   - Complete store listing (screenshots, description, privacy details)
   - Submit for review

**Requirements**:
- macOS with Xcode
- Apple Developer account ($99/year)
- iOS 14+ target

### Post-Deployment Checklist

After deploying to production, verify:

- [ ] Environment variables are set correctly in hosting platform
- [ ] Authentication flow works in production environment
- [ ] Database migrations applied successfully to production Supabase
- [ ] RLS policies are enabled and working correctly
- [ ] Network monitoring works on target platforms (Android/iOS)
- [ ] Offline sync functionality works as expected
- [ ] Weather API integration working (if configured)
- [ ] Test on actual satellite/constrained networks if possible (see `docs/network-modes.md`)
- [ ] Monitor error logs and application performance
- [ ] Set up error tracking service (e.g., Sentry) if desired
- [ ] Configure analytics if needed
- [ ] Review and update privacy policy
- [ ] Test emergency SOS functionality

### Release Preflight

Run the automated preflight checklist before tagging a release to confirm the repo is ready for constrained-network builds:

```bash
pnpm lint:preflight
```

The checklist runs ESLint, Vitest, and verifies both the Android manifest satellite flag and iOS carrier-constrained entitlements, along with Capacitor plugin bridge files.

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

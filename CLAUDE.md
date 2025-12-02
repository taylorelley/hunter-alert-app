# CLAUDE.md - AI Assistant Guide

## Overview

This is **Hunter Alert**, a production-ready mobile-first application built with React, Next.js, and Capacitor, specifically optimized for constrained networks including satellite connections. This guide helps AI assistants understand the codebase structure, development workflows, and key conventions.

> **Note**: For quick reference and action-oriented instructions, see `AGENTS.md`. This file provides comprehensive documentation and architectural details.

**Target Use Case:** Hunters and outdoor enthusiasts checking in from remote areas with limited connectivity (satellite, low-bandwidth cellular, offline environments).

**Tech Stack:**
- Frontend: Next.js 16 (React 19), TypeScript, Tailwind CSS 4
- Mobile: Capacitor 7 (Android 14+, iOS)
- Backend: Supabase (PostgreSQL, RPC functions)
- UI: shadcn/ui (Radix UI primitives)
- Testing: Vitest
- Build: pnpm, GitHub Actions

---

## Directory Structure

```
/home/user/hunter-alert-app/
├── app/                    # Next.js App Router (layout, pages, globals.css)
├── components/             # React UI components
│   ├── ui/                # shadcn/ui base components (Button, Card, Dialog, etc.)
│   ├── modals/            # Feature modals (CheckInModal, SOSModal, PlanTripModal)
│   ├── *-provider.tsx     # Context providers (AppProvider, NetworkProvider, ThemeProvider)
│   ├── *-view.tsx         # Main views (HomeView, TripsView, MapView, etc.)
│   └── *.tsx              # Other components (StatusHeader, MobileNav, etc.)
├── lib/                   # Core utilities and business logic
│   ├── capacitor/         # Native plugins (network-monitor.ts, network-monitor-web.ts)
│   ├── supabase/          # Backend API (client.ts, api.ts, types.ts)
│   ├── sync/              # Sync engine (use-sync-engine.ts, pending-actions.ts, types.ts)
│   ├── offline/           # Network state machine (stateMachine.ts)
│   ├── geolocation.ts     # Geolocation utilities (Capacitor Geolocation wrapper)
│   ├── weather.ts         # Weather API integration (OpenWeatherMap)
│   └── utils.ts           # Tailwind merge helper
├── backend/               # Supabase configuration
│   ├── supabase/
│   │   ├── migrations/    # SQL migrations (0001_init.sql)
│   │   └── config.toml    # Supabase CLI config
│   └── scripts/           # Backend validation scripts
├── android/               # Android native code
│   └── app/src/main/java/com/hunteralert/app/
│       ├── NetworkMonitorPlugin.java
│       └── MainActivity.java
├── ios/                   # iOS native code
│   └── App/App/
│       ├── NetworkMonitorPlugin.swift
│       └── AppDelegate.swift
├── __tests__/             # Vitest unit tests
├── docs/                  # Architecture documentation
│   ├── api.md            # RPC payload/response specs
│   ├── network-modes.md  # Client behavior per connectivity mode
│   ├── capacitor-setup.md # Native plugin setup
│   └── testing.md        # Testing strategy
├── public/               # Static assets
└── .github/workflows/    # CI/CD (build-android.yml)
```

---

## Key Architectural Patterns

### 1. Network-Aware Sync Engine

The app uses a state machine to adapt behavior based on network conditions:

**Network States:**
- `connectivity`: offline | wifi | cellular | satellite
- `constrained`: Low-data mode or bandwidth-constrained
- `ultraConstrained`: Satellite OR (constrained + expensive)
- `expensive`: Metered/cellular connection

**Sync Behavior by Mode:**
- **Offline**: Queue all actions locally (IndexedDB), no API calls
- **Satellite/Ultra-Constrained**: Small batches (3-5 messages), longer backoff (2-4x)
- **Normal (WiFi)**: Larger batches (10-20 messages), normal backoff (5s)

**Key Files:**
- `lib/offline/stateMachine.ts` - Network state derivation
- `lib/sync/use-sync-engine.ts` - React hook orchestrating sync (131 lines)
- `lib/sync/pending-actions.ts` - IndexedDB persistence (idb-keyval)
- `components/network-provider.tsx` - Network monitoring context (145 lines)

### 2. Context-Based State Management

Uses React Context API for global state:

**Key Providers:**
- `NetworkProvider` (`components/network-provider.tsx`): Network status, refresh function
- `AppProvider` (`components/app-provider.tsx`): App state, trips, check-ins, sync engine integration (414 lines)
- `ThemeProvider` (`components/theme-provider.tsx`): next-themes wrapper

**Usage Pattern:**
```typescript
import { useNetwork } from "@/components/network-provider"
import { useApp } from "@/components/app-provider"

function MyComponent() {
  const { state } = useNetwork()
  const { trips, checkIns, enqueueCheckIn } = useApp()
  // ... component logic
}
```

### 3. Native Plugin Architecture

Custom Capacitor plugins detect network conditions on native platforms:

**Android** (`android/app/src/main/java/com/hunteralert/app/NetworkMonitorPlugin.java`):
- Uses `ConnectivityManager` + `NetworkCallback`
- Detects `TRANSPORT_SATELLITE` (API 31+)
- Removes `NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED` for satellite support
- Requires Android 14+ (API 34+)

**iOS** (`ios/App/App/NetworkMonitorPlugin.swift`):
- Uses `NWPathMonitor` (Network framework)
- Checks `path.isConstrained`, `path.isExpensive`
- Detects satellite as `.other` interface type
- Requires carrier-constrained entitlements

**Web Fallback** (`lib/capacitor/network-monitor-web.ts`):
- Uses `navigator.connection` API
- Checks `effectiveType`, `saveData`, `downlink`

### 4. Batch-Oriented API Design

Supabase RPC functions minimize round trips:

**send_message_batch(messages jsonb)**
- Max 20 messages per batch (configurable)
- Max 4KB per message
- Validates auth, trims whitespace, filters empty messages
- Returns inserted messages with server timestamps

**pull_updates(since timestamptz)**
- Returns all updates since cursor (conversations, messages, sync_cursors, groups, waypoints, geofences, profiles)
- Max 100 rows per collection (configurable)
- Ordered by `updated_at`/`created_at`

**API Wrapper** (`lib/supabase/api.ts`):
- `authenticate(client, email, password)` - Sign in
- `sendBatch(client, drafts, maxBatchSize)` - Send message batch
- `pullUpdates(client, since, maxRows)` - Pull updates including all entity types
- `createGroup(client, name, description)` - Create group
- `joinGroup(client, groupId)` - Join existing group
- `addWaypoint(client, params)` - Add waypoint with optional trip/group association
- `createGeofence(client, params)` - Create geofence
- `toggleGeofence(client, geofenceId, enabled)` - Enable/disable geofence
- `deleteWaypoint/deleteGeofence(client, id)` - Delete entities

### 5. Geolocation Integration

**Capacitor Geolocation** (`lib/geolocation.ts`):
- Unified API for GPS across web/Android/iOS
- Permission handling (check, request)
- `getCurrentPosition(options)` - Get current coordinates
- `watchPosition(callback, errorCallback, options)` - Monitor location changes
- `calculateDistance(lat1, lon1, lat2, lon2)` - Haversine distance calculation
- `isWithinGeofence(lat, lon, fenceLat, fenceLon, radius)` - Geofence detection

**Usage:**
```typescript
import { getCurrentPosition, watchPosition } from "@/lib/geolocation"

// Get current position
const coords = await getCurrentPosition()
console.log(coords.latitude, coords.longitude)

// Watch position
const watchId = await watchPosition((coords) => {
  console.log("Position update:", coords)
})
```

**Key Features:**
- Automatic permission requests
- Error handling with fallbacks
- High accuracy mode enabled by default
- Platform-agnostic API

### 6. Weather API Integration

**OpenWeatherMap Integration** (`lib/weather.ts`):
- Real-time weather data by coordinates or city
- Falls back to mock data if API key not configured
- Configurable via `NEXT_PUBLIC_WEATHER_API_KEY` environment variable

**Functions:**
- `getWeatherByCoordinates(lat, lon)` - Fetch weather for coordinates
- `getWeatherByCity(city)` - Fetch weather by city name
- `formatCondition(condition)` - Format weather condition for display
- `getWeatherIconUrl(icon, size)` - Get icon URL from OpenWeatherMap
- `isWeatherApiConfigured()` - Check if API key is set

**Usage:**
```typescript
import { getWeatherByCoordinates } from "@/lib/weather"

const weather = await getWeatherByCoordinates(43.8, -103.5)
console.log(`${weather.temperature}°F ${weather.condition}`)
console.log(`Wind: ${weather.windSpeed}mph, Humidity: ${weather.humidity}%`)
```

**Data Returned:**
- Temperature (Fahrenheit and Celsius)
- Condition and description
- Humidity percentage
- Wind speed (mph and km/h)
- Sunrise/sunset times
- Location name

### 7. Enhanced Database Schema

**Complete Schema** (`backend/supabase/migrations/0001_init.sql`):

**Tables:**
1. `profiles` - User profiles with emergency contacts, premium status, privacy settings
2. `conversations` - Trips/conversations with participant arrays
3. `messages` - Check-ins and communications
4. `sync_cursors` - Per-user sync progress
5. `groups` - User groups with owner and member arrays
6. `waypoints` - GPS waypoints with type, sharing, trip association
7. `geofences` - Geographic boundaries with entry/exit notifications

**Row-Level Security:**
- All tables have RLS enabled
- Users access only their data and shared resources
- Groups: owner + members can access
- Waypoints: owner + shared waypoints in user's trips
- Geofences: owner + members of associated group/trip

**Indexes:**
- Optimized for common queries (user_id, conversation_id, group_id)
- Updated_at indexes for sync operations
- Composite indexes for enabled geofences

---

## Development Workflows

### Initial Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with Supabase credentials:
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Start development server
pnpm dev  # Runs on http://localhost:3000
```

### Working with Components

**Creating New Components:**
1. Use TypeScript with strict mode enabled
2. Prefer functional components with hooks
3. Use `"use client"` directive for client-side components
4. Follow existing patterns in `components/` directory
5. Import UI components from `@/components/ui/`

**Example Component Structure:**
```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useNetwork } from "@/components/network-provider"

export function MyComponent() {
  const { state } = useNetwork()
  const [value, setValue] = useState("")

  return (
    <Card>
      <Button onClick={() => setValue("clicked")}>
        Network: {state.connectivity}
      </Button>
    </Card>
  )
}
```

### Adding UI Components

This project uses **shadcn/ui**. To add new components:

```bash
# Example: Add a new component
npx shadcn-ui@latest add dropdown-menu

# Components are installed to components/ui/
# They are based on Radix UI primitives
# Styled with Tailwind CSS using CSS variables
```

**Important:** UI components use the `cn()` utility from `lib/utils.ts` for conditional class merging.

### Working with the Backend

**Database Schema** (`backend/supabase/migrations/0001_init.sql`):
- `profiles`: User metadata
- `conversations`: Trip groups (participant_ids array)
- `messages`: Check-ins/communications
- `sync_cursors`: Per-user sync progress

**Row-Level Security (RLS):**
- All tables have RLS enabled
- Users can only access their own data and conversations they participate in
- **Never bypass RLS** - always test with authenticated users

**Adding New RPC Functions:**
1. Add SQL function to `backend/supabase/migrations/0001_init.sql`
2. Update `lib/supabase/api.ts` with TypeScript wrapper
3. Add types to `lib/supabase/types.ts`
4. Update `docs/api.md` with documentation

### Testing

**Run Tests:**
```bash
pnpm test              # Run once (Vitest)
pnpm test:watch       # Watch mode
pnpm test:coverage    # Generate coverage report
```

**Test Files** (`__tests__/`):
- `offline.stateMachine.test.ts` - Network state machine tests
- `supabase.api.test.ts` - API wrapper tests (mocked Supabase client)

**Testing Patterns:**
- Use Vitest for unit tests
- Mock Supabase client with `vi.fn()`
- Test offline queue logic thoroughly
- Validate batch size limits and sanitization

**Example Test:**
```typescript
import { describe, it, expect, vi } from 'vitest'
import { sendBatch } from '@/lib/supabase/api'

describe('sendBatch', () => {
  it('should clamp batch to max size', async () => {
    const mockClient = {
      rpc: vi.fn().mockResolvedValue({ data: [], error: null })
    }
    const messages = Array(30).fill({ body: 'test' })
    await sendBatch(mockClient as any, messages, 20)
    expect(mockClient.rpc).toHaveBeenCalledWith('send_message_batch', {
      messages: expect.arrayContaining([expect.objectContaining({ body: 'test' })])
    })
    const payload = mockClient.rpc.mock.calls[0][1].messages
    expect(payload.length).toBeLessThanOrEqual(20)
  })
})
```

### Building for Mobile

**Android:**
```bash
pnpm build                    # Build Next.js → out/
npx cap sync                  # Sync web assets to android/
npx cap open android          # Open in Android Studio

# Build in Android Studio or:
npx cap run android           # Build & run on device
```

**iOS:**
```bash
pnpm build                    # Build Next.js → out/
npx cap sync                  # Sync web assets to ios/
npx cap open ios              # Open in Xcode

# Build in Xcode or:
npx cap run ios               # Build & run on device/simulator
```

**Requirements:**
- Android: Java 21+, Android SDK (API 34+ target)
- iOS: Xcode, CocoaPods, macOS

### Continuous Integration

**GitHub Actions** (`.github/workflows/build-android.yml`):
- Triggered on push to `main` or pull requests
- Builds Next.js app with Supabase env vars
- Syncs Capacitor
- Builds Android APK
- Creates GitHub release with APK artifact

**Required Secrets:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## Code Conventions

### TypeScript

**Configuration** (`tsconfig.json`):
- Target: ES6
- Strict mode enabled
- Module resolution: bundler
- Path alias: `@/*` → `./*`

**Conventions:**
- Use explicit types for function parameters and return values
- Prefer interfaces over types for object shapes
- Use `type` for unions, intersections, and utility types
- Avoid `any` - use `unknown` or proper types

**Example:**
```typescript
// Good
interface Trip {
  id: string
  title: string
  participantIds: string[]
}

function getTrip(id: string): Trip | null {
  // ...
}

// Avoid
function getTrip(id: any): any {
  // ...
}
```

### React Patterns

**Hooks Usage:**
- Use built-in hooks: `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- Custom hooks start with `use` prefix: `useNetwork()`, `useApp()`, `useSyncEngine()`
- Keep hooks at top level (not in conditionals or loops)

**Client Components:**
- Add `"use client"` directive at top of file for client-side interactivity
- All components using hooks, event handlers, or browser APIs need this

**Component Organization:**
- One component per file
- Named exports for components: `export function MyComponent() {}`
- Keep components focused and single-responsibility
- Extract complex logic into custom hooks

### Styling

**Tailwind CSS 4:**
- Uses PostCSS with Tailwind v4 (`postcss.config.mjs`)
- Theme defined in `app/globals.css` using CSS variables
- Color space: oklch (better perceptual uniformity)

**Custom Theme Colors** (`app/globals.css`):
- `--safe`: Green for safe/ok status
- `--warning`: Yellow for warnings
- `--danger`: Red for emergencies
- `--offline`: Purple for offline state

**Utility Function** (`lib/utils.ts`):
```typescript
import { cn } from "@/lib/utils"

// Merge Tailwind classes conditionally
<div className={cn("base-class", isActive && "active-class")} />
```

**Best Practices:**
- Use Tailwind utilities first
- Extract repeated patterns into components
- Use `cn()` for conditional classes
- Avoid inline styles unless absolutely necessary

### File Naming

**Conventions:**
- Components: PascalCase file names matching component name
  - `components/HomeView.tsx` → `export function HomeView()`
  - Exception: kebab-case for shadcn/ui components in `components/ui/`
- Utilities: camelCase
  - `lib/utils.ts`, `lib/capacitor/network-monitor.ts`
- Contexts/Providers: kebab-case with `-provider` suffix
  - `components/network-provider.tsx`, `components/app-provider.tsx`
- Types: PascalCase in `types.ts` files
  - `lib/supabase/types.ts`, `lib/sync/types.ts`

### Import Ordering

**Recommended Order:**
1. React imports
2. Third-party libraries
3. UI components (`@/components/ui/`)
4. Custom components
5. Hooks and utilities
6. Types

**Example:**
```typescript
import { useState, useEffect } from "react"
import { Capacitor } from "@capacitor/core"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StatusHeader } from "@/components/status-header"

import { useNetwork } from "@/components/network-provider"
import { cn } from "@/lib/utils"

import type { NetworkState } from "@/components/network-provider"
```

### Error Handling

**API Calls:**
- Always wrap API calls in try-catch
- Use exponential backoff for retries
- Log errors to console (production: consider error tracking service)

**Example:**
```typescript
try {
  const result = await sendBatch(client, drafts)
  // Handle success
} catch (error) {
  console.error("Failed to send batch:", error)
  // Queue for retry or show user error
}
```

**Network Errors:**
- Queue actions locally on network failure
- Show user-friendly messages (use `sonner` for toasts)
- Retry automatically when network returns

### Security

**Critical Rules:**
- **Never commit `.env` or `.env.local`** (use `.env.example` as template)
- **Never hard-code API keys or secrets**
- **Always use RLS on Supabase tables**
- **Validate user input before sending to backend**
- **Use authenticated API calls** - check `client.auth.getSession()`

**Environment Variables:**
```bash
# .env.local (never commit this)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## Common Tasks for AI Assistants

### Task: Add a New Feature Component

1. **Create component file** in `components/` directory
2. **Use existing patterns** - reference similar components
3. **Add to appropriate view** - HomeView, TripsView, etc.
4. **Test with different network states** - offline, satellite, normal
5. **Update types** if needed (`lib/*/types.ts`)

**Example Steps:**
```bash
# 1. Create component
touch components/new-feature.tsx

# 2. Implement following patterns from existing components
# 3. Import into view
# 4. Test manually with different network modes
# 5. Add unit tests if complex logic
```

### Task: Add a New RPC Function

1. **Add SQL function** to `backend/supabase/migrations/0001_init.sql`
2. **Create TypeScript wrapper** in `lib/supabase/api.ts`
3. **Add types** to `lib/supabase/types.ts`
4. **Document API** in `docs/api.md`
5. **Add tests** in `__tests__/supabase.api.test.ts`

**Example SQL Function:**
```sql
create or replace function my_new_function(param1 text)
returns jsonb
language plpgsql
security definer
as $$
begin
  -- Function logic
  return jsonb_build_object('result', param1);
end;
$$;
```

**Example TypeScript Wrapper:**
```typescript
export async function myNewFunction(
  client: SupabaseClient,
  param1: string,
): Promise<{ result: string }> {
  const { data, error } = await client.rpc('my_new_function', { param1 })
  if (error) throw error
  return data
}
```

### Task: Modify Network Behavior

**Key Files to Update:**
- `lib/offline/stateMachine.ts` - Network state derivation logic
- `lib/sync/use-sync-engine.ts` - Sync timing, batch sizes, backoff
- `components/network-provider.tsx` - Network detection
- `docs/network-modes.md` - Document behavior changes

**Testing:**
- Test offline mode (disable network in browser DevTools)
- Test satellite mode (manually set `ultraConstrained: true`)
- Test normal mode (WiFi connection)
- Verify queue persistence (check IndexedDB in DevTools)

### Task: Update UI Components

**Using shadcn/ui:**
```bash
# Add new component
npx shadcn-ui@latest add component-name

# Update existing component
# Edit file in components/ui/ directly
```

**Customization:**
- Modify `components.json` for config
- Edit `app/globals.css` for theme variables
- Use `cn()` utility for conditional styling

### Task: Debug Network Issues

**Tools:**
1. **Browser DevTools:**
   - Network tab: Throttle to "Slow 3G" or "Offline"
   - Application tab: Check IndexedDB → `keyval-store` → `pending_actions`
   - Console: Look for network status logs

2. **React DevTools:**
   - Check NetworkProvider state
   - Inspect AppProvider context

3. **Native Debugging:**
   - Android: `adb logcat` for NetworkMonitorPlugin logs
   - iOS: Xcode console for NWPathMonitor output

**Common Issues:**
- Queue not flushing → Check `canSync` logic in `use-sync-engine.ts`
- Network state incorrect → Verify plugin implementation for platform
- Batch failures → Check RLS policies and batch size limits

### Task: Add Tests

**Unit Test Example:**
```typescript
// __tests__/my-feature.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '@/lib/my-feature'

describe('myFunction', () => {
  it('should return expected result', () => {
    const result = myFunction('input')
    expect(result).toBe('expected')
  })
})
```

**Run Tests:**
```bash
pnpm test                 # Run all tests
pnpm test my-feature      # Run specific test file
pnpm test:watch          # Watch mode
pnpm test:coverage       # Coverage report
```

---

## Important Constraints

### Network Constraints

**Design for:**
- High latency (500ms - 2000ms)
- Low bandwidth (< 50 kbps)
- Intermittent connectivity
- Expensive data costs

**Avoid:**
- Polling or auto-refresh loops
- Large payloads (>4KB per message)
- Chatty APIs (multiple round trips)
- Auto-downloading assets
- Real-time features in satellite mode

### Platform-Specific Constraints

**Android:**
- Minimum SDK: API 34 (Android 14+)
- Java 21+ required for builds
- Satellite detection requires `TRANSPORT_SATELLITE` (API 31+)
- Bandwidth checks require API 34+

**iOS:**
- Requires carrier-constrained entitlements
- Satellite detected as `.other` interface type (iOS 16.1+)
- Must handle `isConstrained` and `isExpensive` flags

**Next.js:**
- Static export mode (`output: 'export'`)
- No server-side rendering (SSR)
- No API routes (use Supabase instead)
- Images not optimized (`unoptimized: true`)

### Supabase Constraints

**RLS (Row-Level Security):**
- Always enabled on all tables
- Users can only access their own data
- Test with authenticated sessions

**Batch Limits:**
- `send_message_batch`: max 20 messages (configurable)
- `pull_updates`: max 100 rows per collection (configurable)
- Message body: max 4KB

**Authentication:**
- JWT-based sessions
- Tokens expire (handle refresh)
- Check session before API calls

---

## Documentation References

**AI Assistant Guides**:
- `AGENTS.md` - Quick reference and action-oriented instructions for AI agents
- `CLAUDE.md` (this file) - Comprehensive documentation and architectural details

**Project Docs** (`docs/`):
- `api.md` - RPC payload/response specifications
- `network-modes.md` - Client behavior per connectivity mode
- `capacitor-setup.md` - Native plugin setup and troubleshooting
- `testing.md` - Testing strategy and approach

**External References:**
- [Android Satellite/Constrained Networks](https://developer.android.com/develop/connectivity/satellite/constrained-networks)
- [Apple Carrier-Constrained Entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.carrier-constrained.app-optimized)
- [Apple Ultra-Constrained Networks](https://developer.apple.com/documentation/network/optimizing_your_app_s_networking_behavior_for_ultra_constrained_networks)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com)

---

## Quick Reference

### Environment Variables

```bash
# .env.local (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Backend config (optional, defaults shown)
BACKEND_MAX_MESSAGE_BATCH=20
BACKEND_MAX_PULL_LIMIT=100
```

### Key Commands

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start dev server (localhost:3000)
pnpm build                # Build for production (→ out/)
pnpm lint                 # Run ESLint
pnpm test                 # Run tests
pnpm test:coverage       # Test coverage report

# Mobile
npx cap sync              # Sync web assets to native
npx cap open android      # Open Android Studio
npx cap open ios          # Open Xcode
npx cap run android       # Build & run on Android
npx cap run ios           # Build & run on iOS

# Backend (from backend/)
supabase start            # Start local Supabase
supabase db reset         # Reset database with migrations
supabase db push          # Push migrations to remote
```

### Important File Locations

```bash
# Configuration
package.json              # Dependencies, scripts
tsconfig.json             # TypeScript config
next.config.mjs           # Next.js config (static export)
capacitor.config.ts       # Capacitor config (appId, webDir)
components.json           # shadcn/ui config

# Key Source Files
app/layout.tsx            # Root layout
app/page.tsx              # Main entry point
app/globals.css           # Theme variables
components/app-provider.tsx           # App state context (414 lines)
components/network-provider.tsx       # Network monitoring (145 lines)
lib/sync/use-sync-engine.ts          # Sync engine hook (131 lines)
lib/supabase/api.ts                  # API wrapper (87 lines)
backend/supabase/migrations/0001_init.sql  # Database schema (244 lines)

# Native Plugins
android/app/src/main/java/com/hunteralert/app/NetworkMonitorPlugin.java
ios/App/App/NetworkMonitorPlugin.swift

# Tests
__tests__/offline.stateMachine.test.ts
__tests__/supabase.api.test.ts
```

### Color Theme Variables

```css
/* app/globals.css */
--safe: oklch(0.7 0.15 145)           /* Green */
--warning: oklch(0.75 0.15 85)        /* Yellow */
--danger: oklch(0.65 0.2 25)          /* Red */
--offline: oklch(0.65 0.15 285)       /* Purple */
```

---

## Tips for AI Assistants

1. **Always read before modifying** - Use Read tool to understand existing code before making changes

2. **Follow existing patterns** - Reference similar components/functions for consistency

3. **Test network modes** - Consider offline, satellite, and normal modes when adding features

4. **Respect batch limits** - Keep payloads small (max 20 messages, 4KB each)

5. **Check RLS policies** - Ensure new tables/columns have appropriate Row-Level Security

6. **Use type safety** - Leverage TypeScript types, avoid `any`

7. **Document changes** - Update `docs/` when changing API behavior or network logic

8. **Test thoroughly** - Add tests for new features, especially sync/network logic

9. **Consider mobile** - Changes should work on web AND native (Android/iOS)

10. **Optimize for constraints** - Remember: high latency, low bandwidth, expensive data

---

## Version Information

- **Node.js**: 20+
- **pnpm**: 10
- **Next.js**: 16.0.3
- **React**: 19.2.0
- **Capacitor**: 7.4.4
- **Supabase JS**: 2.86.0
- **TypeScript**: 5
- **Tailwind CSS**: 4.1.9
- **Vitest**: 4.0.14

**Last Updated:** 2025-01-29

---

This guide should be updated whenever significant architectural changes occur or new conventions are established.

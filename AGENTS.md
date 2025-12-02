# AGENTS.md

> AI agent instructions for **Hunter Alert** - a network-aware mobile app optimized for satellite and constrained networks

## Your Role

You are a **mobile-first TypeScript engineer** specializing in offline-first React applications with network resilience. You write clean, type-safe code that works reliably in constrained network environments (satellite, low-bandwidth cellular, offline).

## Quick Start

```bash
# Setup
pnpm install
cp .env.example .env.local  # Edit with Supabase credentials

# Development
pnpm dev                    # http://localhost:3000
pnpm lint                   # ESLint with auto-fix
pnpm test                   # Vitest unit tests
pnpm test:watch             # Watch mode
pnpm build                  # Production build → out/

# Mobile
npx cap sync                # Sync web assets to native
npx cap run android         # Build & run Android
npx cap run ios             # Build & run iOS
```

## Tech Stack

- **Frontend**: Next.js 16 (React 19), TypeScript 5, Tailwind CSS 4
- **Mobile**: Capacitor 7 (Android 14+, iOS 16.1+)
- **Backend**: Supabase (PostgreSQL, RPC)
- **UI**: shadcn/ui (Radix primitives)
- **Testing**: Vitest 4
- **Package Manager**: pnpm 10

## Code Style by Example

### Component Pattern
```typescript
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useNetwork } from "@/components/network-provider"

export function FeatureName() {
  const { state } = useNetwork()
  const [isLoading, setIsLoading] = useState(false)

  const handleAction = async () => {
    try {
      setIsLoading(true)
      // Action logic
    } catch (error) {
      console.error("Action failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button onClick={handleAction} disabled={isLoading}>
        Click Me
      </Button>
    </div>
  )
}
```

### API Wrapper Pattern
```typescript
export async function myRpcFunction(
  client: SupabaseClient,
  param: string,
): Promise<{ result: string }> {
  const { data, error } = await client.rpc('my_function', { param })
  if (error) throw error
  return data
}
```

### Test Pattern
```typescript
import { describe, it, expect, vi } from 'vitest'

describe('myFunction', () => {
  it('should handle constrained networks', () => {
    const result = myFunction({ constrained: true })
    expect(result.batchSize).toBe(5)
  })
})
```

## Critical Boundaries

### ✅ Always Do

- **Run complete CI checks before committing** - lint, test, and build must all pass
- Add `"use client"` directive to components with hooks/interactivity
- Wrap API calls in try-catch with proper error handling
- Use TypeScript with explicit types (avoid `any`)
- Test offline behavior when adding network features
- Keep message payloads under 4KB
- Respect batch limits (20 messages, 100 rows)
- Enable RLS on all Supabase tables
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes
- Import UI components from `@/components/ui/`
- Follow naming: PascalCase components, camelCase utilities, kebab-case providers

### ⚠️ Ask First

- Adding new environment variables
- Modifying network state machine (`lib/offline/stateMachine.ts`)
- Changing sync behavior (`lib/sync/use-sync-engine.ts`)
- Adding new Supabase RPC functions
- Modifying native plugins (Android/iOS)
- Changing database schema or RLS policies
- Adding new npm dependencies
- Modifying build configuration

### 🚫 Never Do

- **Commit code that fails lint, test, or build** - all CI checks must pass
- Commit `.env` or `.env.local` files
- Hard-code API keys or secrets
- Bypass Supabase RLS policies
- Use server-side rendering (Next.js is static export only)
- Add polling or auto-refresh loops
- Create large payloads (>4KB per message)
- Use `any` type in TypeScript
- Skip error handling on network operations
- Add real-time features without considering satellite mode

## Network-Aware Design (Critical)

This app is **offline-first** and **network-aware**. Every feature must work across:

- **Offline**: Queue locally (IndexedDB), no API calls
- **Satellite/Ultra-Constrained**: Small batches (3-5), longer backoff (2-4x)
- **Normal (WiFi)**: Larger batches (10-20), normal backoff (5s)

**When adding features:**
1. Use `useNetwork()` hook to check network state
2. Queue actions with `enqueueCheckIn()` or similar
3. Let sync engine handle retry logic
4. Show appropriate UI feedback

**Example:**
```typescript
const { state } = useNetwork()
const { enqueueCheckIn } = useApp()

const handleCheckIn = async () => {
  // Queue locally - sync engine handles network
  await enqueueCheckIn({
    conversationId: trip.id,
    body: message,
    location: coords,
  })
}
```

## Key File Locations

```
components/
  ui/                      # shadcn/ui components (Button, Card, Dialog)
  *-provider.tsx           # Context providers (AppProvider, NetworkProvider)
  *-view.tsx               # Main views (HomeView, TripsView)
  modals/                  # Feature modals

lib/
  supabase/
    api.ts                 # RPC wrappers (sendBatch, pullUpdates)
    types.ts               # TypeScript types
  sync/
    use-sync-engine.ts     # Sync orchestration
    pending-actions.ts     # IndexedDB queue
  offline/
    stateMachine.ts        # Network state derivation
  geolocation.ts           # GPS utilities
  weather.ts               # Weather API
  utils.ts                 # cn() utility

backend/supabase/migrations/
  0001_init.sql            # Database schema

__tests__/                 # Vitest tests
docs/                      # Architecture docs
```

## Adding UI Components

```bash
# Install shadcn/ui component
npx shadcn-ui@latest add dropdown-menu

# Components install to components/ui/
# They use Tailwind CSS with CSS variables from app/globals.css
```

## Testing Strategy

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Test specific file
pnpm test offline.stateMachine
```

**What to test:**
- Network state derivation logic
- Sync engine batch sizing
- API wrappers with mocked Supabase client
- Offline queue persistence

## Pre-Commit Checklist (CRITICAL)

**Before every commit, run the complete CI workflow and fix all issues:**

```bash
# Step 1: Run linter (auto-fix enabled)
pnpm lint

# Step 2: Run all tests
pnpm test

# Step 3: Run production build
pnpm build

# If any command fails, fix the issues before committing
# Do not commit until all three commands succeed
```

**Workflow:**
1. Make your code changes
2. Run `pnpm lint` → Fix any linting errors
3. Run `pnpm test` → Fix any failing tests
4. Run `pnpm build` → Fix any build errors
5. Only after all checks pass: `git add` and `git commit`

**Example:**
```bash
# After making changes
pnpm lint && pnpm test && pnpm build

# If all pass, commit
git add .
git commit -m "Add feature X"
git push
```

**If checks fail:**
- Read error messages carefully
- Fix the specific issues reported
- Re-run the failed check to verify
- Continue from that step

## Common Workflows

### Add New Feature Component

1. Create `components/feature-name.tsx`
2. Import into appropriate view (`HomeView.tsx`, etc.)
3. Use existing patterns (reference similar components)
4. Test with offline mode (DevTools → Network → Offline)
5. Add tests if complex logic
6. **Run `pnpm lint && pnpm test && pnpm build`** before committing

### Add New RPC Function

1. Add SQL to `backend/supabase/migrations/0001_init.sql`
2. Add wrapper to `lib/supabase/api.ts`
3. Add types to `lib/supabase/types.ts`
4. Update `docs/api.md`
5. Add tests to `__tests__/supabase.api.test.ts`
6. **Run `pnpm lint && pnpm test && pnpm build`** before committing

### Modify Network Behavior

1. Update logic in `lib/offline/stateMachine.ts`
2. Adjust sync timing in `lib/sync/use-sync-engine.ts`
3. Update `docs/network-modes.md`
4. Test all three modes (offline, satellite, normal)
5. **Run `pnpm lint && pnpm test && pnpm build`** before committing

## Build for Production

```bash
# Web
pnpm build                 # → out/ directory

# Android
pnpm build
npx cap sync
npx cap open android       # Build in Android Studio

# iOS
pnpm build
npx cap sync
npx cap open ios           # Build in Xcode
```

## Environment Variables

```bash
# Required in .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional
NEXT_PUBLIC_WEATHER_API_KEY=your-openweathermap-key
BACKEND_MAX_MESSAGE_BATCH=20
BACKEND_MAX_PULL_LIMIT=100
```

## Debugging Network Issues

```bash
# Browser DevTools
- Network tab: Throttle to "Slow 3G" or "Offline"
- Application tab: IndexedDB → keyval-store → pending_actions
- Console: Network status logs

# Native
- Android: adb logcat | grep NetworkMonitor
- iOS: Xcode console (NWPathMonitor output)
```

## When You Need Help

- **Detailed architecture**: See `CLAUDE.md`
- **API specs**: See `docs/api.md`
- **Network modes**: See `docs/network-modes.md`
- **Native setup**: See `docs/capacitor-setup.md`
- **Testing approach**: See `docs/testing.md`

## Version Info

- Node.js 20+, pnpm 10
- Next.js 16.0.3, React 19.2.0
- Capacitor 7.4.4, Supabase 2.86.0
- TypeScript 5, Tailwind CSS 4.1.9

---

**Remember**: This app serves hunters in remote areas with satellite/low-bandwidth connections. Prioritize small payloads, offline support, and resilient sync logic over real-time features and rich media.

# Testing strategy

This project prioritizes reliability on constrained networks. The testing strategy mixes unit, integration, and network-focused checks to validate queueing, sync behavior, and the Supabase wrapper.

## Unit tests
- **Supabase wrapper (`lib/supabase/api.ts`)**
  - Authenticate happy/failed paths.
  - Batch validation (size caps, whitespace trimming, empty batches are skipped).
  - Pull updates slicing to configured limits and defensive handling of malformed payloads.
- **Offline queue + sync state machine**
  - Network transitions (offline/satellite/normal) derived from connectivity and constrained flags.
  - Queue persistence while offline; batch sizing differences in satellite vs. normal modes.
  - Flush semantics: oldest-first dispatch and preservation of unflushed items.

## Integration tests
- The `__tests__/integration` suite uses Vitest to boot a local Supabase stack via the CLI, apply migrations, and seed a user + conversation.
- It exercises `send_message_batch` and `pull_updates` end-to-end, checking cursor advancement, client-side batch limits, and replay of queued offline messages.
- Network throttling is simulated with a DevTools-style fetch harness to emulate high latency and bandwidth caps before asserting backoff/trim behavior.
- Enable locally with `RUN_SUPABASE_INTEGRATION=1 pnpm vitest run __tests__/integration --threads=false` (CI sets this flag so the suite runs on every pipeline). The GitHub Actions workflow installs the Supabase CLI, caches its binaries plus downloaded Postgres images to speed up `supabase start`, and fans the job into the required status checks alongside lint/unit runs.

## Network and resilience tests (targeted/manual)
- Use `toxiproxy` or browser DevTools throttling to emulate satellite latency and bandwidth caps; verify backoff intervals and batch trimming.
- Drop packets intermittently to ensure queue retries do not duplicate messages beyond configured attempts.
- Force constrained network flags on Android/iOS plugins to confirm the state machine switches to satellite mode and pauses aggressive polling.

## Tooling
- **Vitest** for unit tests with coverage reporting via V8.
- Future integration harnesses can reuse Vitest and spin up a seeded Supabase container via the CLI for reproducibility.

## Running tests
- Install dependencies: `pnpm install` (or `npm install`).
- Run the suite: `pnpm test`.
- Watch mode during development: `pnpm test:watch`.
- Coverage report: `pnpm test:coverage`.

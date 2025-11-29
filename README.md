# Hunter Alert App

## Overview
Hunter Alert is a Next.js-based client experience tuned for constrained networks such as satellite links. The repository now includes Supabase backend assets (schema, security policies, and RPC functions) alongside the web client.

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

## Documentation
- `docs/api.md` documents RPC payloads and expected responses.
- `docs/network-modes.md` describes how the client should adapt requests in normal, satellite, and offline modes.

## Next steps
- Wire the frontend to the Supabase API wrapper in `lib/supabase/`.
- Add mobile-specific networking plugins for Android/iOS to detect constrained links and adjust sync cadence.

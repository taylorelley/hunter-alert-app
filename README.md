# Hunter Alert App

## Overview
Hunter Alert is a Next.js-based client experience currently focused on UI and interaction flows for constrained-network safety scenarios. The repository presently contains only frontend assets (React components, styling, and configuration) with no server-side runtime bundled in the codebase.

## Backend status (clean slate)
- No backend or server artifacts are present (no `/api`, `/server`, `/functions`, `/backend`, or Supabase configuration directories exist in the repository).
- Package scripts are limited to Next.js client workflows (`dev`, `build`, `start`, `lint`) and do not invoke any legacy backend tasks.
- There are no CI workflows or build configurations referencing backend jobs.
- Supabase and other backend services have not been initialized yet; this README section documents the clean slate before introducing a new Supabase stack.

## Frontend development
- `pnpm dev` (or `npm run dev`) to start the Next.js development server.
- `pnpm build` (or `npm run build`) to create a production build.
- `pnpm start` (or `npm run start`) to serve the production build.
- `pnpm lint` (or `npm run lint`) to run lint checks.

## Next steps
- Plan and bootstrap the Supabase backend (schema, security policies, and RPC/edge functions) once the new backend design is ready.
- Wire the client to the Supabase SDK after backend scaffolding is in place.

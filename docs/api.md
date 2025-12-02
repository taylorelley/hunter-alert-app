# API reference

This repository uses Supabase Postgres with row-level security enabled on all application tables. The primary interaction pattern is via small RPC calls to reduce traffic on constrained networks.

## Environment
- `SUPABASE_URL` – project URL
- `SUPABASE_ANON_KEY` – public client key
- `SUPABASE_SERVICE_ROLE_KEY` – server-side key for maintenance
- `SUPABASE_JWT_SECRET` – JWT signing secret for testing or Edge Functions

## Tables
- `profiles`: one row per authenticated user (linked to `auth.users.id`). Only the owner can read or write.
- `conversations`: stores participant membership in `participant_ids` (an array of user IDs). Access is limited to participants.
- `messages`: individual messages linked to conversations. Inserts require the caller to be the sender and a conversation participant.
- `sync_cursors`: stores per-user checkpoints for incremental sync.

All tables have `updated_at` timestamps and RLS policies restricting access to the authenticated user (`auth.uid()`).

## RPC: `send_message_batch(messages jsonb)`
Batched insert of outbound messages. The function enforces authentication, payload shape, and batching limits.

**Request payload**
```json
[
  {
    "conversation_id": "uuid",
    "body": "text content",
    "client_id": "optional client GUID",
    "metadata": { "contentType": "text/plain" },
    "created_at": "2025-01-20T12:00:00Z"
  }
]
```

**Limits**
- Maximum batch size: `app.max_message_batch` (defaults to 20; configurable via `BACKEND_MAX_MESSAGE_BATCH`).
- Maximum body length: 4,000 bytes per message.
- Empty or whitespace-only bodies are skipped.
- Only messages targeting conversations that already include the caller are accepted.

**Response**
Returns the inserted `messages` rows to the caller, honoring RLS.

## RPC: `pull_updates(since timestamptz)`
Returns recent changes for the authenticated user in a single JSON payload.

**Request payload**
```json
{
  "since": "2025-01-20T11:55:00Z"
}
```

**Behavior**
- If `since` is `null`, the most recent records are returned up to the limit.
- Payload aggregates `conversations`, `messages`, and `sync_cursors`.
- Results are ordered by `updated_at`/`created_at` to support pagination.

**Limits**
- Maximum rows per collection: `app.max_pull_limit` (defaults to 100; configurable via `BACKEND_MAX_PULL_LIMIT`).
- Access restricted to conversations where `auth.uid()` is a participant and to the caller’s own sync cursors.

## RPC: `resend_group_invitation(invitation_id uuid)`
Marks a pending invitation as resent by updating its metadata. Only the original sender can resend.

**Behavior**
- Validates the caller is authenticated and the invitation exists.
- Verifies `auth.uid()` matches `sender_id` before updating `metadata.resent_at`.
- Returns the full `group_invitations` row after the update.

## RPC: `withdraw_group_invitation(invitation_id uuid)`
Allows an invitation sender to withdraw a pending invite.

**Behavior**
- Requires authentication and that the caller is the original sender.
- Rejects non-pending invitations with a descriptive error.
- Sets `status` to `declined` and merges `metadata.withdrawn_by_sender: true`.
- Returns the updated `group_invitations` row.

## RPC: `update_geofence(...)`
Updates a geofence owned by the authenticated user and records group activity when applicable.

**Request payload**
```json
{
  "geofence_id": "uuid",
  "geofence_name": "Boundary name",
  "latitude": 39.7392,
  "longitude": -104.9903,
  "radius_meters": 750,
  "geofence_description": "Optional notes"
}
```

**Behavior**
- Ensures the caller owns the geofence via `user_id` check.
- Updates the name, description, coordinates, and radius in one transaction.
- When linked to a group, appends a `geofence` entry to `group_activity` for auditability.
- Returns the updated `geofences` row.

## Error handling
- Requests without a valid JWT fail with `Authentication is required`.
- Violating batch limits raises descriptive errors (e.g., exceeding message count or body size).
- RLS violations return empty sets or permission errors depending on context.

## Recommended client workflow
1. Call `pull_updates` on startup to hydrate local cache.
2. Queue outbound messages locally and submit via `send_message_batch` respecting batch size caps.
3. Update `sync_cursors` when applying inbound data so incremental pulls stay small.
4. Back off aggressively on satellite/ultra-constrained links and favor larger intervals between pulls.

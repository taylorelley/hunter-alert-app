# Network modes and backend behavior

The backend APIs are tuned for high-latency, low-bandwidth links. Client behavior should adapt batching and request cadence to minimize round trips while keeping user data current.

## Modes
- **Normal (wifi/cellular, unconstrained):**
  - Call `pull_updates` frequently (e.g., every 30–60 seconds) to keep timelines fresh.
  - Send queued messages immediately via `send_message_batch`, respecting the 20-message cap.
  - Larger payloads are acceptable, but message bodies are still capped at 4 KB.

- **Satellite (constrained):**
  - Increase `pull_updates` interval (e.g., 2–5 minutes) and rely on the `since` cursor to shrink responses.
  - Group outbound messages locally and flush in batches below the configured `BACKEND_MAX_MESSAGE_BATCH` limit.
  - Avoid sending empty metadata; keep JSON minimal to reduce airtime.

- **Offline:**
  - Do not call RPCs. Append to a local queue until connectivity improves.
  - Persist `since` timestamps and pending messages so the next `pull_updates` request can reconcile gaps.

- **Ultra-constrained carrier mode (iOS) or extreme bandwidth-constrained (Android):**
  - Pause background refreshes entirely unless the user explicitly requests sync.
  - Prefer manual “Sync now” controls and verify payload size before dispatching.
  - Consider trimming historical `pull_updates` windows by moving `since` forward aggressively once data is acknowledged.

## Batch sizing and payload discipline
- `send_message_batch` refuses payloads above the batch count or per-message byte limit, preventing costly retries on weak links.
- `pull_updates` returns at most `BACKEND_MAX_PULL_LIMIT` rows per collection to keep responses small. Clients should follow-up with another call using the most recent timestamp if more data is needed.

## Sync cursors
- Update `sync_cursors` as soon as the client commits incoming data locally; smaller deltas keep `pull_updates` responses lean.
- Store cursors per conversation to allow partial progress without requiring a full refresh.

## Error handling guidance
- Authentication failures surface immediately; cache tokens locally to avoid extra auth traffic.
- Rate-limit retries with exponential backoff in satellite mode to avoid congesting constrained paths.

AGENTS.md · Satellite Ready Mobile App Builder
Role
You are an AI Coding Agent that designs and builds a production ready mobile app that works well on satellite and other constrained networks.

The app:

Uses React + Capacitor for the client.
Targets Android and iOS.
Uses Supabase as the backend.
Is tuned for constrained satellite networks on both platforms using the following references:
Android Satellite / Constrained networks: https://developer.android.com/develop/connectivity/satellite/constrained-networks
Apple Carrier‑Constrained Entitlement: https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.carrier-constrained.app-optimized
Apple Ultra‑Constrained Networks: https://developer.apple.com/documentation/network/optimizing_your_app_s_networking_behavior_for_ultra_constrained_networks
Your job is to go from blank repo to working system, including build scripts, configs, and basic tests.

High level outcomes
You must deliver:

A working mobile client that:
Detects network state (wifi, cellular, satellite, constrained, offline).
Switches to a “satellite mode” that reduces traffic and feature use.
Queues work while offline and flushes in small batches.
A Supabase backend that:
Stores core data (users, messages or similar).
Provides small, batch oriented APIs.
Enforces strict Row Level Security.
Platform specific glue:
Android manifest and networking code for constrained satellite networks.
iOS entitlements and Network framework code for carrier constrained networks.
Assume the app’s main feature is low‑volume messaging or check‑ins.

Constraints and assumptions
Satellite and constrained networks

High latency, low bandwidth, and possible outages.
Avoid frequent polling, large payloads, and chatty patterns.
Tech stack

Frontend: React + TypeScript + Capacitor.
Backend: Supabase (Postgres, SQL migrations, RLS).
Build: Vite + Capacitor.
Code style

TypeScript on client, SQL migrations on backend.
Small modules, clear logs, predictable failure behavior.
Privacy and safety

No hard‑coded secrets.
Use environment variables.
Work plan
Phase 1 · Requirements and network model
Define minimal product scope (auth, message list, send/receive).
Define three network modes:
normal
satellite
offline
For each feature define behavior per mode.
Create documentation: docs/network-modes.md.
Phase 2 · Repo setup
Structure:

/app          React + Capacitor client
/backend      Supabase SQL migrations, RPC/Edge Functions
/docs         Design documentation
Initialize:

npm create vite@latest
npx cap init
Add Android and iOS targets.
Add ESLint, Prettier, TS config.
Add simple test runner (Vitest or Jest).
Phase 3 · Supabase backend design
Schema
Tables:

profiles
conversations
messages
sync_cursors
RLS
Enable RLS on all tables and create policies limiting access to user‑owned data.

Batch endpoints
Implement via RPC or Edge Functions:

send_message_batch(messages jsonb)
pull_updates(since timestamptz)
Limit request sizes and batch sizes.

API wrapper
Create a TypeScript wrapper around @supabase/supabase-js and include:

sendBatch()
pullUpdates()
authenticate()
Document APIs in docs/api.md.

Phase 4 · Client network model and data path
Network state type
type NetworkConnectivity = 'offline' | 'wifi' | 'cellular' | 'satellite';

type NetworkState = {
  connectivity: NetworkConnectivity;
  constrained: boolean;
  ultraConstrained?: boolean;
};
Implement a NetworkContext or store that consumes Capacitor plugins.

Local queue
Store pending actions:

type PendingActionType = 'SEND_MESSAGE';

interface PendingAction {
  id: string;
  type: PendingActionType;
  payload: any;
  createdAt: string;
}
Use local storage (IndexedDB or Capacitor Storage).

Sync engine
State machine by network mode:

offline: queue only
satellite: batch + backoff
normal: batch faster
Retry partial failures with capped attempts.

Phase 5 · Android constrained satellite support
Docs:
https://developer.android.com/develop/connectivity/satellite/constrained-networks

5.1 Manifest opt‑in
Add to manifest:

<meta-data
    android:name="android.telephony.PROPERTY_SATELLITE_DATA_OPTIMIZED"
    android:value="${applicationId}" />
5.2 NetworkRequest
Remove the “not constrained” requirement:

val request = NetworkRequest.Builder()
    .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED)
    .build()
5.3 Detecting satellite
Use ConnectivityManager:

val isSatellite = caps?.hasTransport(NetworkCapabilities.TRANSPORT_SATELLITE) == true
val constrained = caps?.hasCapability(
    NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED
) != true
Return this to JS via Capacitor plugin.

Phase 6 · iOS carrier‑constrained satellite support
Docs:
Main entitlement:
https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.carrier-constrained.app-optimized

Ultra constrained network behavior:
https://developer.apple.com/documentation/network/optimizing_your_app_s_networking_behavior_for_ultra_constrained_networks

6.1 Entitlements
Add to app’s .entitlements file:

<key>com.apple.developer.networking.carrier-constrained.app-optimized</key>
<true/>
<key>com.apple.developer.networking.carrier-constrained.appcategory</key>
<string>messaging</string>
6.2 Detecting constrained paths
Use NWPathMonitor:

let constrained = path.isConstrained
let expensive = path.isExpensive
Map these to the NetworkState type and return via Capacitor plugin.

Phase 7 · React UI and UX
Show a small banner showing network state.
Restrict heavy features in satellite mode.
Queue actions in offline mode and inform user.
Provide manual “Sync” button.
Avoid auto‑refresh loops.
Phase 8 · Testing
Unit tests
Queue logic
Sync engine
Supabase wrapper
Integration tests
End‑to‑end send/receive message flow
Network tests
Simulate:

High latency
Low bandwidth
Packet loss
Phase 9 · Deployment considerations
Satellite modes vary by carrier.
App must behave correctly when switching between LTE/WiFi/satellite paths.
Document expected behavior.
Deliverables Checklist
You must deliver:

AGENTS.md (this file)
docs/network-modes.md
docs/api.md
docs/testing.md
Working React + Capacitor app
Android + iOS network plugins
Supabase schema + RPC/Edge functions
Basic test suite
A complete README.md with setup instructions

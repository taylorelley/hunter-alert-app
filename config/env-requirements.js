const BASE_REQUIRED_ENV_VARS = [
  { key: "NEXT_PUBLIC_SUPABASE_URL", description: "Supabase project URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", description: "Supabase anon public key" },
];

const WEATHER_API_REQUIREMENT = {
  key: "NEXT_PUBLIC_WEATHER_API_KEY",
  description: "OpenWeatherMap API key for live weather",
};

export const REQUIRED_ENV_VARS =
  process.env.NODE_ENV === "production"
    ? [...BASE_REQUIRED_ENV_VARS, WEATHER_API_REQUIREMENT]
    : BASE_REQUIRED_ENV_VARS;

export const CONSTRAINED_ENV_LIMITS = [
  {
    key: "BACKEND_MAX_MESSAGE_BATCH",
    min: 1,
    max: 20,
    defaultValue: 20,
    description: "Max messages accepted by the send_message_batch RPC.",
  },
  {
    key: "BACKEND_MAX_PULL_LIMIT",
    min: 10,
    max: 200,
    defaultValue: 100,
    description: "Rows pulled per entity in pull_updates to cap payload sizes.",
  },
  {
    key: "SYNC_NORMAL_BATCH_LIMIT",
    min: 1,
    max: 20,
    defaultValue: 10,
    description: "Client-side batch size when on unconstrained or Wi-Fi connectivity.",
  },
  {
    key: "SYNC_SATELLITE_BATCH_LIMIT",
    min: 1,
    max: 20,
    defaultValue: 5,
    description: "Client-side batch size when on constrained or satellite links.",
  },
  {
    key: "SYNC_ULTRA_BATCH_LIMIT",
    min: 1,
    max: 20,
    defaultValue: 3,
    description: "Client-side batch size when ultra-constrained flags are detected.",
  },
  {
    key: "SYNC_BASE_BACKOFF_MS",
    min: 1000,
    max: 60000,
    defaultValue: 5000,
    description: "Base backoff delay in milliseconds for sync retries under loss.",
  },
];

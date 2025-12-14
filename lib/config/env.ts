import { CONSTRAINED_ENV_LIMITS, REQUIRED_ENV_VARS } from '@/config/env-requirements.mjs'

export type SettingSource = 'env' | 'default' | 'clamped'

interface NumberSetting {
  key: string
  value: number
  min: number
  max: number
  defaultValue: number
  source: SettingSource
  description: string
}

interface SupabaseConfig {
  url: string
  anonKey: string
  configured: boolean
}

interface AppConfig {
  supabase: SupabaseConfig
  constraints: {
    backendMaxMessageBatch: NumberSetting
    backendMaxPullLimit: NumberSetting
    syncNormalBatchLimit: NumberSetting
    syncSatelliteBatchLimit: NumberSetting
    syncUltraBatchLimit: NumberSetting
    syncBaseBackoffMs: NumberSetting
  }
  billing: {
    revenueCatApiKey: string
    entitlementId: string
    offeringId: string
  }
}

function resolveNumberSetting(definition: {
  key: string
  min: number
  max: number
  defaultValue: number
  description: string
}): NumberSetting {
  const raw = process.env[definition.key]
  if (raw === undefined || raw === null || raw === '') {
    return {
      ...definition,
      value: definition.defaultValue,
      source: 'default',
    }
  }

  const parsed = Number(raw)

  if (Number.isNaN(parsed)) {
    return {
      ...definition,
      value: definition.defaultValue,
      source: 'default',
    }
  }

  const clamped = Math.min(Math.max(parsed, definition.min), definition.max)
  return {
    ...definition,
    value: clamped,
    source: clamped === parsed ? 'env' : 'clamped',
  }
}

const limitDefs = CONSTRAINED_ENV_LIMITS as unknown as Array<{
  key: string
  min: number
  max: number
  defaultValue: number
  description: string
}>

const limits = Object.fromEntries(
  limitDefs.map((definition) => [definition.key, resolveNumberSetting(definition)]),
)

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

const revenueCatApiKey =
  process.env.NEXT_PUBLIC_REVENUECAT_API_KEY || process.env.REVENUECAT_API_KEY || ''
const revenueCatEntitlement = process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT || 'pro'
const revenueCatOffering = process.env.NEXT_PUBLIC_REVENUECAT_OFFERING || 'default'

export const appConfig: AppConfig = {
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseKey,
    configured: Boolean(supabaseUrl && supabaseKey),
  },
  constraints: {
    backendMaxMessageBatch: limits.BACKEND_MAX_MESSAGE_BATCH,
    backendMaxPullLimit: limits.BACKEND_MAX_PULL_LIMIT,
    syncNormalBatchLimit: limits.SYNC_NORMAL_BATCH_LIMIT,
    syncSatelliteBatchLimit: limits.SYNC_SATELLITE_BATCH_LIMIT,
    syncUltraBatchLimit: limits.SYNC_ULTRA_BATCH_LIMIT,
    syncBaseBackoffMs: limits.SYNC_BASE_BACKOFF_MS,
  },
  billing: {
    revenueCatApiKey,
    entitlementId: revenueCatEntitlement,
    offeringId: revenueCatOffering,
  },
}

export const missingRequiredEnv = REQUIRED_ENV_VARS.filter(
  (entry) => !process.env[entry.key],
).map((entry) => entry.key)

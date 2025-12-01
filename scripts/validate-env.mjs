import { pathToFileURL } from 'url'
import { CONSTRAINED_ENV_LIMITS, REQUIRED_ENV_VARS } from '../config/env-requirements.js'

function normalizeNumber(value, { min, max, defaultValue }) {
  if (value === undefined || value === null || value === '') {
    return { value: defaultValue, source: 'defaulted' }
  }

  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return { value: defaultValue, source: 'defaulted' }
  }

  const clamped = Math.min(Math.max(parsed, min), max)
  const source = clamped === parsed ? 'env' : 'clamped'
  return { value: clamped, source }
}

export function validateEnvConfig({ quiet = false } = {}) {
  const errors = []
  const warnings = []
  const effective = {}

  for (const required of REQUIRED_ENV_VARS) {
    if (!process.env[required.key]) {
      errors.push(`${required.key} is required (${required.description}).`)
    }
  }

  for (const limit of CONSTRAINED_ENV_LIMITS) {
    const { value, source } = normalizeNumber(process.env[limit.key], limit)
    effective[limit.key] = { value, ...limit, source }
    if (source === 'defaulted') {
      warnings.push(`${limit.key} not set; defaulting to ${value}.`)
      process.env[limit.key] = String(value)
    } else if (source === 'clamped') {
      warnings.push(`${limit.key} set outside ${limit.min}-${limit.max}; clamped to ${value}.`)
      process.env[limit.key] = String(value)
    }
  }

  if (!quiet) {
    if (warnings.length > 0) {
      console.warn('[env] configuration warnings:\n- ' + warnings.join('\n- '))
    }
    console.info('[env] effective constrained-network settings:')
    console.table(
      Object.values(effective).map((entry) => ({
        key: entry.key,
        value: entry.value,
        range: `${entry.min}-${entry.max}`,
        default: entry.defaultValue,
        source: entry.source,
      })),
    )
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n- ${errors.join('\n- ')}`)
  }

  return { effective, warnings }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateEnvConfig()
}

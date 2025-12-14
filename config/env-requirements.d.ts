declare module '@/config/env-requirements.mjs' {
  export interface RequiredEnvVar {
    key: string
    description: string
  }

  export const REQUIRED_ENV_VARS: RequiredEnvVar[]

  export interface ConstrainedEnvLimit {
    key: string
    min: number
    max: number
    defaultValue: number
    description: string
  }

  export const CONSTRAINED_ENV_LIMITS: ConstrainedEnvLimit[]
}

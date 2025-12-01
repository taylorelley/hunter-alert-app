function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const KEY = "hunter_device_session_id"

export function getClientSessionId(): string {
  if (typeof window === "undefined") {
    return "ssr-device"
  }

  try {
    const existing = window.localStorage.getItem(KEY)
    if (existing) return existing
    const next = generateId()
    window.localStorage.setItem(KEY, next)
    return next
  } catch (error) {
    console.warn("Unable to access localStorage for device session id", error)
    return generateId()
  }
}

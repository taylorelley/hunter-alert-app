function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  const randomPart = Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
  return `${Date.now()}-${randomPart.slice(0, 16)}`
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

import { get, set } from "idb-keyval"
import { DeviceSession } from "@/lib/supabase/types"

const STORE_KEY = "device_sessions_cache"

export async function readCachedDeviceSessions(): Promise<DeviceSession[]> {
  try {
    const cached = await get<DeviceSession[]>(STORE_KEY)
    if (Array.isArray(cached) && cached.every((session) => typeof session?.id === "string")) {
      return cached
    }
    return []
  } catch (error) {
    console.warn("Unable to read cached device sessions", error)
    return []
  }
}

export async function persistCachedDeviceSessions(sessions: DeviceSession[]): Promise<void> {
  try {
    await set(STORE_KEY, sessions)
  } catch (error) {
    console.warn("Unable to persist device sessions", error)
  }
}

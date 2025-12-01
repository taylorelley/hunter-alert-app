import { get, set } from "idb-keyval"
import { DeviceSession } from "@/lib/supabase/types"

const STORE_KEY = "device_sessions_cache"

export async function readCachedDeviceSessions(): Promise<DeviceSession[]> {
  try {
    return (await get<DeviceSession[]>(STORE_KEY)) ?? []
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

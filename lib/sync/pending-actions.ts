import { del, get, set } from "idb-keyval"
import { PendingAction } from "./types"

const STORE_KEY = "pending_actions"

export async function readPendingActions(): Promise<PendingAction[]> {
  try {
    return (await get<PendingAction[]>(STORE_KEY)) ?? []
  } catch (error) {
    console.warn("Falling back to empty queue due to storage error", error)
    return []
  }
}

export async function persistPendingActions(actions: PendingAction[]): Promise<void> {
  try {
    await set(STORE_KEY, actions)
  } catch (error) {
    console.warn("Unable to persist pending actions", error)
  }
}

export async function clearPendingActions(): Promise<void> {
  try {
    await del(STORE_KEY)
  } catch (error) {
    console.warn("Unable to clear pending actions", error)
  }
}

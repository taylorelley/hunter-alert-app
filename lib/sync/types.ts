export type PendingActionType = "SEND_MESSAGE"

export interface PendingAction {
  id: string
  type: PendingActionType
  payload: any
  createdAt: string
}

export type SyncStatus = "idle" | "sending" | "pulling" | "backoff"

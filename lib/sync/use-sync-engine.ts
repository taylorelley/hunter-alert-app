"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SupabaseClient } from "@supabase/supabase-js"
import { pullUpdates, sendBatch } from "../supabase/api"
import { MessageDraft, PullUpdatesResult } from "../supabase/types"
import { persistPendingActions, readPendingActions } from "./pending-actions"
import { PendingAction, SyncStatus } from "./types"
import { NetworkState } from "@/components/network-provider"
import { appConfig } from "@/lib/config/env"

function isMessageDraft(payload: unknown): payload is MessageDraft {
  if (typeof payload !== "object" || payload === null) return false
  const record = payload as Record<string, unknown>
  return typeof record.conversation_id === "string" && typeof record.body === "string"
}

interface SyncEngineOptions {
  client: SupabaseClient | null
  network: NetworkState
  sessionReady: boolean
  cursor: string | null
  onCursor: (value: string | null) => void
  onPullApplied?: (result: PullUpdatesResult) => void
  onSendApplied?: (actions: PendingAction[], records: Record<string, unknown>[]) => void
}

const SYNC_LIMITS = appConfig.constraints

export function useSyncEngine({
  client,
  network,
  sessionReady,
  cursor,
  onCursor,
  onPullApplied,
  onSendApplied,
}: SyncEngineOptions) {
  const [pending, setPending] = useState<PendingAction[]>([])
  const [status, setStatus] = useState<SyncStatus>("idle")
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const backoffRef = useRef<NodeJS.Timeout | null>(null)
  const syncingRef = useRef(false)
  const failureCountRef = useRef(0)

  const canSync = useMemo(() => network.connectivity !== "offline" && sessionReady && !!client, [client, network, sessionReady])

  useEffect(() => {
    readPendingActions().then(setPending)
  }, [])

  useEffect(() => {
    persistPendingActions(pending)
  }, [pending])

  const markCursor = useCallback(
    (value: string | null) => {
      onCursor(value)
      setLastSyncedAt(new Date().toISOString())
    },
    [onCursor],
  )

  const flush = useCallback(async () => {
    if (!client || !canSync) return
    if (syncingRef.current) return

    syncingRef.current = true
    setStatus(pending.length > 0 ? "sending" : "pulling")

    try {
      const sendable = pending.filter(
        (action) => action.type === "SEND_MESSAGE" || action.type === "SEND_ALERT",
      )
      if (sendable.length > 0) {
        const invalidActionIds: string[] = []
        const validSendable = sendable.filter((action): action is PendingAction & { payload: MessageDraft } => {
          if (!isMessageDraft(action.payload)) {
            console.warn(`Invalid payload for action ${action.id}, skipping`)
            invalidActionIds.push(action.id)
            return false
          }
          return true
        })

        if (invalidActionIds.length > 0) {
          const invalidSet = new Set(invalidActionIds)
          setPending((current) => current.filter((action) => !invalidSet.has(action.id)))
        }

        const constrainedBatch = Math.min(
          SYNC_LIMITS.backendMaxMessageBatch.value,
          network.ultraConstrained
            ? SYNC_LIMITS.syncUltraBatchLimit.value
            : network.constrained
              ? SYNC_LIMITS.syncSatelliteBatchLimit.value
              : SYNC_LIMITS.syncNormalBatchLimit.value,
        )
        const toSend = validSendable.slice(0, constrainedBatch)
        const drafts: MessageDraft[] = toSend.map((action) => ({
          ...action.payload,
          client_id: action.id,
        }))

        if (drafts.length > 0) {
          const response = await sendBatch(client, drafts, constrainedBatch)
          if (onSendApplied) {
            onSendApplied(toSend, response.data ?? [])
          }
          const sentIds = new Set(toSend.map((item) => item.id))
          setPending((current) => current.filter((action) => !sentIds.has(action.id)))
        }
      }

      setStatus("pulling")
      const updates = await pullUpdates(client, cursor)
      const newCursor = updates.sync_cursors?.[0]?.last_cursor
      markCursor(typeof newCursor === 'string' ? newCursor : cursor)
      onPullApplied?.(updates)
      setStatus("idle")
      if (backoffRef.current) {
        clearTimeout(backoffRef.current)
      }
      failureCountRef.current = 0
    } catch (error) {
      console.error("Sync failed", error)
      setStatus("backoff")
      const baseDelay = SYNC_LIMITS.syncBaseBackoffMs.value
      const attempt = Math.min(failureCountRef.current, 4)
      const modeMultiplier = network.ultraConstrained ? 4 : network.constrained ? 2 : 1
      const delay = baseDelay * modeMultiplier * 2 ** attempt
      failureCountRef.current += 1
      backoffRef.current = setTimeout(() => {
        syncingRef.current = false
        flush()
      }, delay)
      return
    }

    syncingRef.current = false
  }, [client, canSync, cursor, markCursor, network.constrained, network.ultraConstrained, onPullApplied, onSendApplied, pending])

  useEffect(() => {
    if (canSync) {
      flush()
    }
  }, [canSync, flush, network.lastUpdated])

  useEffect(() => {
    if (canSync && pending.length > 0) {
      flush()
    }
  }, [canSync, flush, pending.length])

  useEffect(() => {
    return () => {
      if (backoffRef.current) {
        clearTimeout(backoffRef.current)
      }
    }
  }, [])

  const enqueue = useCallback((action: PendingAction) => {
    setPending((current) => [...current, action])
  }, [])

  return {
    pending,
    enqueue,
    flush,
    status,
    lastSyncedAt,
  }
}

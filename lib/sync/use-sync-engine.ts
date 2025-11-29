"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SupabaseClient } from "@supabase/supabase-js"
import { pullUpdates, sendBatch } from "../supabase/api"
import { MessageDraft, PullUpdatesResult } from "../supabase/types"
import { persistPendingActions, readPendingActions } from "./pending-actions"
import { PendingAction, SyncStatus } from "./types"
import { NetworkState } from "@/components/network-provider"

interface SyncEngineOptions {
  client: SupabaseClient | null
  network: NetworkState
  sessionReady: boolean
  cursor: string | null
  onCursor: (value: string | null) => void
  onPullApplied?: (result: PullUpdatesResult) => void
  onSendApplied?: (actions: PendingAction[], records: any[]) => void
}

const BASE_BACKOFF_MS = 5000

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
      const sendable = pending.filter((action) => action.type === "SEND_MESSAGE")
      if (sendable.length > 0) {
        const drafts: MessageDraft[] = sendable.map((action) => ({
          ...action.payload,
          client_id: action.id,
        }))

        const maxBatch = network.ultraConstrained ? 3 : network.constrained ? 5 : undefined
        const response = await sendBatch(client, drafts, maxBatch)
        if (onSendApplied) {
          onSendApplied(sendable, response.data ?? [])
        }
        setPending((current) => current.filter((action) => !sendable.some((item) => item.id === action.id)))
      }

      setStatus("pulling")
      const updates = await pullUpdates(client, cursor)
      markCursor(updates.sync_cursors?.[0]?.last_cursor ?? cursor)
      onPullApplied?.(updates)
      setStatus("idle")
      backoffRef.current && clearTimeout(backoffRef.current)
    } catch (error) {
      console.error("Sync failed", error)
      setStatus("backoff")
      const delay = network.ultraConstrained ? BASE_BACKOFF_MS * 4 : network.constrained ? BASE_BACKOFF_MS * 2 : BASE_BACKOFF_MS
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

"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Session, User } from "@supabase/supabase-js"
import { createSupabaseClient } from "@/lib/supabase/client"
import { authenticate } from "@/lib/supabase/api"
import { useNetwork } from "./network-provider"
import { useSyncEngine } from "@/lib/sync/use-sync-engine"
import { PendingAction } from "@/lib/sync/types"
import { PullUpdatesResult } from "@/lib/supabase/types"

export type TripStatus = "none" | "planning" | "active" | "paused" | "completed"
export type CheckInStatus = "ok" | "pending" | "overdue"

export interface CheckIn {
  id: string
  timestamp: Date
  status: "ok" | "need-help"
  notes: string
  batteryLevel: number
  signalStrength: number
  pending?: boolean
}

export interface Trip {
  id: string
  destination: string
  startDate: Date
  endDate: Date
  checkInCadence: number
  emergencyContacts: string[]
  notes: string
  status: TripStatus
  checkIns: CheckIn[]
}

export interface Waypoint {
  id: string
  name: string
  type: "camp" | "vehicle" | "hazard" | "custom" | "water" | "viewpoint"
  coordinates: { lat: number; lng: number }
  notes: string
  isPrivate: boolean
  createdAt: Date
}

export interface Group {
  id: string
  name: string
  description: string
  members: { id: string; name: string; role: "owner" | "admin" | "member" }[]
  waypoints: Waypoint[]
}

interface Profile {
  id: string
  display_name: string
  avatar_url?: string | null
  metadata?: Record<string, any>
}

interface AppState {
  isOnline: boolean
  isPremium: boolean
  currentTrip: Trip | null
  trips: Trip[]
  waypoints: Waypoint[]
  groups: Group[]
  checkInStatus: CheckInStatus
  nextCheckInDue: Date | null
  sosActive: boolean
  userName: string
  emergencyContacts: { name: string; phone: string }[]
}

interface AppContextValue extends AppState {
  session: Session | null
  user: User | null
  pendingActions: PendingAction[]
  syncStatus: string
  lastSyncedAt: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  startTrip: (trip: Omit<Trip, "id" | "checkIns" | "status">) => Promise<void>
  endTrip: () => Promise<void>
  checkIn: (status: "ok" | "need-help", notes: string) => Promise<void>
  addWaypoint: (waypoint: Omit<Waypoint, "id" | "createdAt">) => void
  triggerSOS: (silent: boolean) => void
  cancelSOS: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function uniqueId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
}

function mapConversationToTrip(conversation: Record<string, any>, messages: Record<string, any>[]): Trip {
  const metadata = (conversation.metadata || {}) as Record<string, any>
  const cadence = Number(metadata.checkInCadence ?? 4)
  const startDate = metadata.startDate
    ? new Date(metadata.startDate)
    : conversation.created_at
      ? new Date(conversation.created_at)
      : new Date()
  const endDate = metadata.endDate ? new Date(metadata.endDate) : new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000)
  const tripMessages = messages.filter((message) => message.conversation_id === conversation.id)
  const checkIns: CheckIn[] = tripMessages.map((message) => ({
    id: message.id,
    timestamp: new Date(message.created_at || Date.now()),
    status: message.metadata?.status === "need-help" ? "need-help" : "ok",
    notes: message.body,
    batteryLevel: message.metadata?.batteryLevel ?? 75,
    signalStrength: message.metadata?.signalStrength ?? 3,
    pending: Boolean(message.pending),
  }))

  return {
    id: conversation.id,
    destination: conversation.title || metadata.destination || "Untitled trip",
    startDate,
    endDate,
    checkInCadence: cadence,
    emergencyContacts: metadata.emergencyContacts || [],
    notes: metadata.notes || "",
    status: metadata.status || "active",
    checkIns: checkIns.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { state: network } = useNetwork()
  const [supabase] = useState(() => createSupabaseClient())
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [, setProfile] = useState<Profile | null>(null)
  const [conversations, setConversations] = useState<Record<string, any>[]>([])
  const [messages, setMessages] = useState<Record<string, any>[]>([])
  const [syncCursor, setSyncCursor] = useState<string | null>(null)

  const [state, setState] = useState<AppState>({
    isOnline: network.connectivity !== "offline",
    isPremium: false,
    currentTrip: null,
    trips: [],
    waypoints: [],
    groups: [],
    checkInStatus: "pending",
    nextCheckInDue: null,
    sosActive: false,
    userName: "Guest",
    emergencyContacts: [],
  })

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authenticate(supabase, email, password)
      setSession(result.session)
      setUser(result.user)
    },
    [supabase],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setConversations([])
    setMessages([])
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (!supabase || !session) return
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle()
    if (data) {
      setProfile(data as Profile)
      setState((prev) => ({
        ...prev,
        userName: data.display_name || prev.userName,
        isPremium: Boolean((data.metadata as any)?.isPremium),
        emergencyContacts: ((data.metadata as any)?.emergencyContacts as AppState["emergencyContacts"]) || prev.emergencyContacts,
      }))
    }
  }, [session, supabase])

  const applyRemote = useCallback(
    (result: PullUpdatesResult) => {
      setConversations(result.conversations ?? [])
      setMessages((prev) => {
        const merged = [...prev]
        const byId = new Map(merged.map((item) => [item.id, item]))
        for (const message of result.messages ?? []) {
          const existing = byId.get(message.id) || byId.get(message.client_id)
          if (existing) {
            Object.assign(existing, { ...message, pending: false })
            byId.set(existing.id, existing)
          } else {
            byId.set(message.id, { ...message, pending: false })
          }
        }
        return Array.from(byId.values())
      })
    },
    [],
  )

  const applySendResults = useCallback((actions: PendingAction[], records: any[]) => {
    if (!actions.length) return
    setMessages((prev) => {
      const byId = new Map(prev.map((msg) => [msg.id, msg]))
      records.forEach((record) => {
        const match = actions.find((action) => action.id === record.client_id)
        if (match) {
          byId.set(match.id, { ...record, pending: false })
        }
      })
      return Array.from(byId.values())
    })
  }, [])

  const { enqueue, pending, status, lastSyncedAt, flush } = useSyncEngine({
    client: supabase,
    network,
    sessionReady: Boolean(session?.access_token),
    cursor: syncCursor,
    onCursor: setSyncCursor,
    onPullApplied: applyRemote,
    onSendApplied: applySendResults,
  })

  const refresh = useCallback(async () => {
    await refreshProfile()
    await flush()
  }, [flush, refreshProfile])

  useEffect(() => {
    setState((prev) => ({ ...prev, isOnline: network.connectivity !== "offline" }))
  }, [network.connectivity])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session)
        setUser(data.session.user)
      }
    })
  }, [supabase])

  useEffect(() => {
    if (user && session) {
      refreshProfile()
      flush()
    }
  }, [flush, refreshProfile, session, user])

  useEffect(() => {
    if (!conversations.length) {
      setState((prev) => ({ ...prev, currentTrip: null, trips: [], checkInStatus: "pending", nextCheckInDue: null }))
      return
    }

    const mappedTrips = conversations.map((conversation) => mapConversationToTrip(conversation, messages))
    const activeTrip = mappedTrips[0]
    const cadenceMs = (activeTrip?.checkInCadence || 4) * 60 * 60 * 1000
    const lastCheckIn = activeTrip?.checkIns[0]?.timestamp
    const now = Date.now()
    const nextDue = lastCheckIn ? new Date(lastCheckIn.getTime() + cadenceMs) : null
    const overdue = nextDue ? nextDue.getTime() < now : false
    const pendingCheck = activeTrip?.checkIns[0]?.pending

    setState((prev) => ({
      ...prev,
      currentTrip: activeTrip,
      trips: mappedTrips,
      checkInStatus: pendingCheck ? "pending" : overdue ? "overdue" : "ok",
      nextCheckInDue: nextDue,
    }))
  }, [conversations, messages])

  const startTrip = useCallback(
    async (trip: Omit<Trip, "id" | "checkIns" | "status">) => {
      if (!session) throw new Error("Sign-in required before starting a trip")
      const metadata = {
        destination: trip.destination,
        notes: trip.notes,
        checkInCadence: trip.checkInCadence,
        emergencyContacts: trip.emergencyContacts,
        startDate: trip.startDate.toISOString(),
        endDate: trip.endDate.toISOString(),
        status: "active",
      }

      const { data, error } = await supabase
        .from("conversations")
        .insert({
          participant_ids: [session.user.id],
          title: trip.destination,
          metadata,
        })
        .select()
        .maybeSingle()

      if (error) throw error
      if (data) {
        setConversations((prev) => [data, ...prev])
      }
    },
    [session, supabase],
  )

  const endTrip = useCallback(async () => {
    if (!session || !state.currentTrip) return
    const metadata = {
      destination: state.currentTrip.destination,
      notes: state.currentTrip.notes,
      checkInCadence: state.currentTrip.checkInCadence,
      emergencyContacts: state.currentTrip.emergencyContacts,
      startDate: state.currentTrip.startDate.toISOString(),
      endDate: state.currentTrip.endDate.toISOString(),
      status: "completed",
    }
    await supabase
      .from("conversations")
      .update({ metadata })
      .eq("id", state.currentTrip.id)
    setState((prev) => ({ ...prev, currentTrip: prev.currentTrip ? { ...prev.currentTrip, status: "completed" } : null }))
  }, [session, state.currentTrip, supabase])

  const checkIn = useCallback(
    async (statusValue: "ok" | "need-help", notes: string) => {
      if (!state.currentTrip || !session) throw new Error("Active trip and session required to check in")
      const actionId = uniqueId()
      const payload = {
        conversation_id: state.currentTrip.id,
        body: notes || (statusValue === "ok" ? "Check-in" : "Assistance requested"),
        metadata: {
          status: statusValue,
          batteryLevel: 75,
          signalStrength: 3,
        },
        created_at: new Date().toISOString(),
      }

      enqueue({
        id: actionId,
        type: "SEND_MESSAGE",
        payload,
        createdAt: payload.created_at,
      })

      setMessages((prev) => [
        ...prev,
        {
          id: actionId,
          conversation_id: payload.conversation_id,
          body: payload.body,
          metadata: payload.metadata,
          created_at: payload.created_at,
          sender_id: session.user.id,
          pending: true,
        },
      ])
    },
    [enqueue, session, state.currentTrip],
  )

  const addWaypoint = useCallback((waypoint: Omit<Waypoint, "id" | "createdAt">) => {
    const newWaypoint: Waypoint = { ...waypoint, id: uniqueId(), createdAt: new Date() }
    setState((prev) => ({ ...prev, waypoints: [newWaypoint, ...prev.waypoints] }))
  }, [])

  const triggerSOS = useCallback((silent: boolean) => {
    console.warn(`SOS triggered (${silent ? "silent" : "full"})`)
    setState((prev) => ({ ...prev, sosActive: true }))
  }, [])

  const cancelSOS = useCallback(() => {
    setState((prev) => ({ ...prev, sosActive: false }))
  }, [])

  const contextValue = useMemo<AppContextValue>(
    () => ({
      ...state,
      session,
      user,
      pendingActions: pending,
      syncStatus: status,
      lastSyncedAt,
      signIn,
      signOut,
      refresh,
      startTrip,
      endTrip,
      checkIn,
      addWaypoint,
      triggerSOS,
      cancelSOS,
    }),
    [addWaypoint, cancelSOS, checkIn, endTrip, lastSyncedAt, pending, refresh, session, signIn, signOut, startTrip, state, status, user],
  )

  return <AppContext.Provider value={contextValue}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}

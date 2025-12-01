"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Session, User } from "@supabase/supabase-js"
import { createSupabaseClient } from "@/lib/supabase/client"
import { authenticate, createGroup as apiCreateGroup, addWaypoint as apiAddWaypoint, createGeofence as apiCreateGeofence } from "@/lib/supabase/api"
import { useNetwork } from "./network-provider"
import { useSyncEngine } from "@/lib/sync/use-sync-engine"
import { PendingAction } from "@/lib/sync/types"
import { PullUpdatesResult, Group as APIGroup, Waypoint as APIWaypoint, Geofence as APIGeofence, Profile as APIProfile } from "@/lib/supabase/types"

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

export interface MemberLocation {
  id: string
  name: string
  coordinates: { lat: number; lng: number }
  accuracy: number | undefined
  heading: number | null
  updatedAt: string
}

export interface Geofence {
  id: string
  name: string
  description: string
  latitude: number
  longitude: number
  radiusMeters: number
  enabled: boolean
  notifyOnEntry: boolean
  notifyOnExit: boolean
  createdAt: Date
}

export interface Group {
  id: string
  name: string
  description: string
  members: { id: string; name: string; role: "owner" | "admin" | "member" }[]
  waypoints: Waypoint[]
}

type ConversationRecord = {
  id?: string
  title?: string | null
  metadata?: Record<string, unknown> | null
}

type MessageRecord = {
  id?: string
  client_id?: string
  message_type?: string | null
  status?: string | null
  body?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string
  conversation_id?: string
  pending?: boolean
}

interface AppState {
  isOnline: boolean
  isPremium: boolean
  currentTrip: Trip | null
  trips: Trip[]
  waypoints: Waypoint[]
  memberLocations: MemberLocation[]
  groups: Group[]
  geofences: Geofence[]
  checkInStatus: CheckInStatus
  nextCheckInDue: Date | null
  sosActive: boolean
  userName: string
  emergencyContacts: { name: string; phone: string }[]
}

interface AppContextValue extends AppState {
  session: Session | null
  user: User | null
  profile: APIProfile | null
  pendingActions: PendingAction[]
  syncStatus: string
  lastSyncedAt: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  startTrip: (trip: Omit<Trip, "id" | "checkIns" | "status">) => Promise<void>
  updateTrip: (tripId: string, trip: Omit<Trip, "id" | "checkIns">) => Promise<void>
  endTrip: () => Promise<void>
  checkIn: (status: "ok" | "need-help", notes: string) => Promise<void>
  addWaypoint: (waypoint: Omit<Waypoint, "id" | "createdAt">) => Promise<void>
  createGroup: (name: string, description?: string) => Promise<void>
  createGeofence: (params: {
    name: string
    latitude: number
    longitude: number
    radiusMeters?: number
    description?: string
    groupId?: string
    conversationId?: string
  }) => Promise<void>
  triggerSOS: (silent: boolean) => void
  cancelSOS: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function uniqueId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
}

function parseDate(value: unknown, fallback = new Date()): Date {
  return typeof value === "string" ? new Date(value) : fallback
}

function mapConversationToTrip(conversation: ConversationRecord, messages: MessageRecord[]): Trip {
  const metadata = (conversation.metadata as Record<string, unknown> | null) ?? {}
  const rawCadence = Number(metadata.checkInCadence ?? 4)
  const cadence = Number.isFinite(rawCadence) ? rawCadence : 4
  const startDate = parseDate(metadata.startDate, new Date())
  const endDate = parseDate(metadata.endDate, new Date(startDate.getTime() + 3 * 24 * 60 * 60 * 1000))
  const emergencyContacts = Array.isArray(metadata.emergencyContacts)
    ? (metadata.emergencyContacts as string[])
    : []

  const tripMessages = messages.filter((message) => message.conversation_id === conversation.id)
  const checkIns: CheckIn[] = tripMessages
    .filter((message) => !message.message_type || message.message_type === "check_in")
    .map((message) => {
      const checkInMetadata = (message.metadata as Record<string, unknown> | null) ?? {}
      const batteryLevel = typeof checkInMetadata.batteryLevel === "number" ? checkInMetadata.batteryLevel : 75
      const signalStrength = typeof checkInMetadata.signalStrength === "number" ? checkInMetadata.signalStrength : 3
      const status = checkInMetadata.status === "need-help" ? "need-help" : "ok"

      return {
        id: message.id || message.client_id || uniqueId(),
        timestamp: parseDate(message.created_at, new Date()),
        status,
        notes: (checkInMetadata.notes as string) || message.body || "",
        batteryLevel,
        signalStrength,
        pending: message.status === "pending",
      }
    })

  return {
    id: conversation.id ?? uniqueId(),
    destination: (conversation.title as string) || (metadata.destination as string) || "Untitled trip",
    startDate,
    endDate,
    checkInCadence: cadence,
    emergencyContacts,
    notes: (metadata.notes as string) || "",
    status: (metadata.status as TripStatus) || "active",
    checkIns: checkIns.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { state: network } = useNetwork()
  const [supabase] = useState(() => createSupabaseClient())
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<APIProfile | null>(null)
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [messages, setMessages] = useState<MessageRecord[]>([])
  const [backendGroups, setBackendGroups] = useState<APIGroup[]>([])
  const [backendWaypoints, setBackendWaypoints] = useState<APIWaypoint[]>([])
  const [backendGeofences, setBackendGeofences] = useState<APIGeofence[]>([])
  const [backendProfiles, setBackendProfiles] = useState<APIProfile[]>([])
  const [syncCursor, setSyncCursor] = useState<string | null>(null)

  const [state, setState] = useState<AppState>({
    isOnline: network.connectivity !== "offline",
    isPremium: false,
    currentTrip: null,
    trips: [],
    waypoints: [],
    memberLocations: [],
    groups: [],
    geofences: [],
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
      const profileData = data as unknown as APIProfile
      setProfile(profileData)
      setState((prev) => ({
        ...prev,
        userName: profileData.display_name || prev.userName,
        isPremium: Boolean(profileData.is_premium),
        emergencyContacts: profileData.emergency_contacts || prev.emergencyContacts,
      }))
    }
  }, [session, supabase])

  const applyRemote = useCallback(
    (result: PullUpdatesResult) => {
      setConversations((result.conversations ?? []) as ConversationRecord[])
      setMessages((prev) => {
        const merged = [...prev]
        const byId = new Map(merged.map((item) => [item.id ?? item.client_id ?? uniqueId(), item]))
        for (const message of (result.messages ?? []) as MessageRecord[]) {
          const messageId = message.id ?? message.client_id ?? uniqueId()
          const existing = byId.get(messageId)
          if (existing) {
            Object.assign(existing, { ...message, pending: false })
            byId.set(messageId, existing)
          } else {
            byId.set(messageId, { ...message, pending: false })
          }
        }
        return Array.from(byId.values())
      })

      // Update groups, waypoints, and geofences from backend
      if (result.groups && result.groups.length > 0) {
        setBackendGroups(result.groups)
      }
      if (result.waypoints && result.waypoints.length > 0) {
        setBackendWaypoints(result.waypoints)
      }
      if (result.geofences && result.geofences.length > 0) {
        setBackendGeofences(result.geofences)
      }

      if (result.profiles && result.profiles.length > 0) {
        setBackendProfiles(result.profiles as APIProfile[])

        const allProfiles = result.profiles as APIProfile[]
        const profileData =
          (session?.user?.id && allProfiles.find((profile) => profile.id === session.user.id)) || allProfiles[0]
        setProfile(profileData)
        setState((prev) => ({
          ...prev,
          userName: profileData.display_name || prev.userName,
          isPremium: Boolean(profileData.is_premium),
          emergencyContacts: profileData.emergency_contacts || prev.emergencyContacts,
        }))
      }
    },
    [session?.user?.id],
  )

  const applySendResults = useCallback((actions: PendingAction[], records: Record<string, unknown>[]) => {
    if (!actions.length) return
    setMessages((prev) => {
      const byId = new Map(prev.map((msg) => [msg.id, msg]))
      records.forEach((record) => {
        const match = actions.find((action) => action.id === record.client_id)
        if (match) {
          byId.set(match.id, { ...(record as MessageRecord), pending: false })
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

    const mappedTrips = conversations
      .map((conversation) => mapConversationToTrip(conversation, messages))
      .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())

    const activeTrip = mappedTrips.find((trip) => trip.status === "active") || null

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
      checkInStatus: activeTrip ? (pendingCheck ? "pending" : overdue ? "overdue" : "ok") : "pending",
      nextCheckInDue: activeTrip ? nextDue : null,
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
        await flush()
      }
    },
    [flush, session, supabase],
  )

  const updateTrip = useCallback(
    async (tripId: string, trip: Omit<Trip, "id" | "checkIns">) => {
      if (!session) throw new Error("Sign-in required before updating a trip")

      const metadata = {
        destination: trip.destination,
        notes: trip.notes,
        checkInCadence: trip.checkInCadence,
        emergencyContacts: trip.emergencyContacts,
        startDate: trip.startDate.toISOString(),
        endDate: trip.endDate.toISOString(),
        status: trip.status,
      }

      const { data, error } = await supabase
        .from("conversations")
        .update({
          title: trip.destination,
          metadata,
        })
        .eq("id", tripId)
        .select()
        .maybeSingle()

      if (error) throw error
      if (data) {
        setConversations((prev) => prev.map((conversation) => (conversation.id === tripId ? data : conversation)))
      }

      await flush()
    },
    [flush, session, supabase],
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
    const { data: updatedConversation } = await supabase
      .from("conversations")
      .update({ metadata })
      .eq("id", state.currentTrip.id)
      .select()
      .maybeSingle()

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === state.currentTrip?.id ? { ...conversation, ...(updatedConversation ?? {}), metadata } : conversation,
      ),
    )

    setState((prev) => ({
      ...prev,
      currentTrip: null,
      trips: prev.trips.map((trip) => (trip.id === state.currentTrip?.id ? { ...trip, status: "completed" } : trip)),
    }))

    await flush()
  }, [flush, session, state.currentTrip, supabase])

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

  const addWaypoint = useCallback(
    async (waypoint: Omit<Waypoint, "id" | "createdAt">) => {
      if (!session) throw new Error("Sign-in required to add waypoint")

      try {
        const result = await apiAddWaypoint(supabase, {
          name: waypoint.name,
          latitude: waypoint.coordinates.lat,
          longitude: waypoint.coordinates.lng,
          type: waypoint.type,
          description: waypoint.notes,
          tripId: state.currentTrip?.id,
          shared: !waypoint.isPrivate,
        })

        // Optimistically update local state
        setBackendWaypoints((prev) => [result, ...prev])
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error adding waypoint:", error)
        throw error
      }
    },
    [flush, session, state.currentTrip?.id, supabase],
  )

  const createGroup = useCallback(
    async (name: string, description?: string) => {
      if (!session) throw new Error("Sign-in required to create group")

      try {
        const result = await apiCreateGroup(supabase, name, description)
        setBackendGroups((prev) => [result, ...prev])
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error creating group:", error)
        throw error
      }
    },
    [flush, session, supabase],
  )

  const createGeofence = useCallback(
    async (params: {
      name: string
      latitude: number
      longitude: number
      radiusMeters?: number
      description?: string
      groupId?: string
      conversationId?: string
    }) => {
      if (!session) throw new Error("Sign-in required to create geofence")

      try {
        const result = await apiCreateGeofence(supabase, params)
        setBackendGeofences((prev) => [result, ...prev])
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error creating geofence:", error)
        throw error
      }
    },
    [flush, session, supabase],
  )

  const triggerSOS = useCallback((silent: boolean) => {
    console.warn(`SOS triggered (${silent ? "silent" : "full"})`)
    setState((prev) => ({ ...prev, sosActive: true }))
  }, [])

  const cancelSOS = useCallback(() => {
    setState((prev) => ({ ...prev, sosActive: false }))
  }, [])

  // Convert backend waypoints and groups to UI format
  useEffect(() => {
    // Convert backend waypoints to UI format
    const uiWaypoints: Waypoint[] = backendWaypoints.map((wp) => ({
      id: wp.id,
      name: wp.name,
      type: wp.waypoint_type as Waypoint["type"],
      coordinates: { lat: wp.latitude, lng: wp.longitude },
      notes: wp.description || "",
      isPrivate: !wp.shared,
      createdAt: new Date(wp.created_at),
    }))

    // Convert backend groups to UI format
    const uiGroups: Group[] = backendGroups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description || "",
      members: g.member_ids.map((id, index) => ({
        id,
        name: id === g.owner_id ? "Owner" : `Member ${index + 1}`,
        role: id === g.owner_id ? "owner" : "member",
      })),
      waypoints: [], // Waypoints are managed separately
    }))

    const uiGeofences: Geofence[] = backendGeofences.map((geofence) => ({
      id: geofence.id,
      name: geofence.name,
      description: geofence.description || "",
      latitude: geofence.latitude,
      longitude: geofence.longitude,
      radiusMeters: geofence.radius_meters,
      enabled: geofence.enabled,
      notifyOnEntry: geofence.notify_on_entry,
      notifyOnExit: geofence.notify_on_exit,
      createdAt: new Date(geofence.created_at),
    }))

    const uiMemberLocations = backendProfiles
      .map<MemberLocation | null>((profile) => {
        const metadata = profile.metadata
        const lastLocation = metadata?.last_location || metadata?.lastLocation

        const lat = typeof lastLocation?.latitude === "number" ? lastLocation.latitude : Number(lastLocation?.lat)
        const lng = typeof lastLocation?.longitude === "number" ? lastLocation.longitude : Number(lastLocation?.lng)

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null
        }

        return {
          id: profile.id,
          name: profile.display_name || profile.email || "Member",
          coordinates: { lat, lng },
          accuracy: typeof lastLocation?.accuracy === "number" ? lastLocation.accuracy : undefined,
          heading: typeof lastLocation?.heading === "number" ? lastLocation.heading : null,
          updatedAt:
            typeof lastLocation?.updated_at === "string"
              ? lastLocation.updated_at
              : typeof lastLocation?.timestamp === "string"
                ? lastLocation.timestamp
                : profile.updated_at,
        }
      })
      .filter((item): item is MemberLocation => Boolean(item))

    setState((prev) => ({
      ...prev,
      waypoints: uiWaypoints,
      memberLocations: uiMemberLocations,
      groups: uiGroups,
      geofences: uiGeofences,
    }))
  }, [backendWaypoints, backendGroups, backendGeofences, backendProfiles])

  const contextValue = useMemo<AppContextValue>(
    () => ({
      ...state,
      session,
      user,
      profile,
      pendingActions: pending,
      syncStatus: status,
      lastSyncedAt,
      signIn,
      signOut,
      refresh,
      startTrip,
      endTrip,
      updateTrip,
      checkIn,
      addWaypoint,
      createGroup,
      createGeofence,
      triggerSOS,
      cancelSOS,
    }),
    [
      addWaypoint,
      cancelSOS,
      checkIn,
      createGeofence,
      createGroup,
      endTrip,
      lastSyncedAt,
      pending,
      profile,
      refresh,
      session,
      signIn,
      signOut,
      startTrip,
      updateTrip,
      state,
      status,
      user,
    ],
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

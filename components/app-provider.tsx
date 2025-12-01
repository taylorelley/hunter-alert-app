"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { Session, User } from "@supabase/supabase-js"
import { createSupabaseClient } from "@/lib/supabase/client"
import {
  authenticate,
  createGroup as apiCreateGroup,
  addWaypoint as apiAddWaypoint,
  createGeofence as apiCreateGeofence,
  inviteToGroup as apiInviteToGroup,
  respondToGroupInvite as apiRespondToGroupInvite,
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  toggleGeofence as apiToggleGeofence,
  updateGeofenceAlerts as apiUpdateGeofenceAlerts,
} from "@/lib/supabase/api"
import { useNetwork } from "./network-provider"
import { useSyncEngine } from "@/lib/sync/use-sync-engine"
import { PendingAction } from "@/lib/sync/types"
import { getCurrentPosition } from "@/lib/geolocation"
import {
  PullUpdatesResult,
  Group as APIGroup,
  Waypoint as APIWaypoint,
  Geofence as APIGeofence,
  Profile as APIProfile,
  GroupInvitation as APIGroupInvitation,
  GroupActivity as APIGroupActivity,
  MessageDraft,
} from "@/lib/supabase/types"

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

type SOSStatus = "idle" | "queued" | "sending" | "delivered" | "canceled" | "resolved" | "failed"

interface SOSLocation {
  lat: number
  lng: number
  accuracy?: number
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
  groupId: string | null
  conversationId: string | null
  createdAt: Date
}

export interface Group {
  id: string
  name: string
  description: string
  members: { id: string; name: string; role: "owner" | "admin" | "member" }[]
  waypoints: Waypoint[]
  role: "owner" | "admin" | "member"
}

export interface GroupInvitation {
  id: string
  groupId: string
  senderId: string
  recipientId: string | null
  recipientEmail: string | null
  role: "member" | "admin"
  status: "pending" | "accepted" | "declined"
  createdAt: Date
}

export interface GroupActivity {
  id: string
  groupId: string
  actorId: string
  actorName: string
  type: "create" | "invite" | "join" | "leave" | "geofence" | "waypoint" | "role_change" | "alert"
  description: string
  createdAt: Date
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
  groupInvitations: GroupInvitation[]
  groupActivity: GroupActivity[]
  checkInStatus: CheckInStatus
  nextCheckInDue: Date | null
  sosActive: boolean
  sosStatus: SOSStatus
  lastSOSLocation: SOSLocation | null
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
  inviteToGroup: (groupId: string, email: string, role?: "member" | "admin") => Promise<void>
  respondToInvitation: (invitationId: string, decision: "accept" | "decline") => Promise<void>
  joinGroup: (groupId: string) => Promise<void>
  leaveGroup: (groupId: string) => Promise<void>
  toggleGeofenceAlerts: (geofenceId: string, enabled: boolean) => Promise<void>
  updateGeofenceAlerts: (
    geofenceId: string,
    options: { notifyOnEntry: boolean; notifyOnExit: boolean; enabled?: boolean },
  ) => Promise<void>
  triggerSOS: (silent: boolean) => Promise<void>
  cancelSOS: () => Promise<void>
  resolveSOS: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

function uniqueId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
}

function parseDate(value: unknown, fallback = new Date()): Date {
  return typeof value === "string" ? new Date(value) : fallback
}

function mergeRecords<T extends { id?: string }>(current: T[], incoming: T[]): T[] {
  if (!incoming.length) return current
  const map = new Map(current.map((item) => [item.id ?? uniqueId(), item]))
  incoming.forEach((item) => {
    const key = item.id ?? uniqueId()
    map.set(key, { ...(map.get(key) ?? {}), ...item })
  })
  return Array.from(map.values())
}

function normalizeSOSMetadata(message: MessageRecord): {
  status: "active" | "canceled" | "resolved"
  location: SOSLocation | null
  silent: boolean
} | null {
  const metadata = (message.metadata as Record<string, unknown> | null) ?? {}
  const kind = ((metadata.type as string) || (metadata.kind as string) || message.message_type)?.toLowerCase()
  if (kind !== "sos" && kind !== "alert") {
    return null
  }

  const rawStatus = ((metadata.status as string) || (message.status as string) || "active").toLowerCase()
  const status: "active" | "canceled" | "resolved" =
    rawStatus === "canceled" || rawStatus === "cancelled"
      ? "canceled"
      : rawStatus === "resolved"
        ? "resolved"
        : "active"

  const rawLocation = metadata.location as Record<string, unknown> | undefined
  const lat = typeof rawLocation?.latitude === "number" ? rawLocation.latitude : Number(rawLocation?.lat)
  const lng = typeof rawLocation?.longitude === "number" ? rawLocation.longitude : Number(rawLocation?.lng)
  const accuracy = typeof rawLocation?.accuracy === "number" ? rawLocation.accuracy : undefined

  const location: SOSLocation | null = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, accuracy } : null

  return {
    status,
    location,
    silent: Boolean(metadata.silent),
  }
}

function isMessageDraftPayload(payload: unknown): payload is MessageDraft {
  if (!payload || typeof payload !== "object") return false
  const candidate = payload as Record<string, unknown>
  return typeof candidate.conversation_id === "string" && typeof candidate.body === "string"
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
  const [backendGroupInvitations, setBackendGroupInvitations] = useState<APIGroupInvitation[]>([])
  const [backendGroupActivity, setBackendGroupActivity] = useState<APIGroupActivity[]>([])
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
    groupInvitations: [],
    groupActivity: [],
    checkInStatus: "pending",
    nextCheckInDue: null,
    sosActive: false,
    sosStatus: "idle",
    lastSOSLocation: null,
    userName: "Guest",
    emergencyContacts: [],
  })

  const captureSOSLocation = useCallback(async (): Promise<SOSLocation | null> => {
    try {
      const coords = await getCurrentPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 })
      return {
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
      }
    } catch (error) {
      console.warn("Unable to capture SOS location", error)
      return state.lastSOSLocation
    }
  }, [state.lastSOSLocation])

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
    setBackendGroups([])
    setBackendGroupInvitations([])
    setBackendGroupActivity([])
    setBackendWaypoints([])
    setBackendGeofences([])
    setBackendProfiles([])
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (!supabase || !session) return
    const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle()
    if (data) {
      const profileData = data as unknown as APIProfile
      setProfile(profileData)
      setBackendProfiles((prev) => mergeRecords(prev, [profileData]))
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
      setConversations((prev) => mergeRecords(prev, (result.conversations ?? []) as ConversationRecord[]))
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
      setBackendGroups((prev) => mergeRecords(prev, result.groups ?? []))
      setBackendGroupInvitations((prev) => mergeRecords(prev, result.group_invitations ?? []))
      setBackendGroupActivity((prev) => mergeRecords(prev, result.group_activity ?? []))
      setBackendWaypoints((prev) => mergeRecords(prev, result.waypoints ?? []))
      setBackendGeofences((prev) => mergeRecords(prev, result.geofences ?? []))

      if (result.profiles && result.profiles.length > 0) {
        setBackendProfiles((prev) => mergeRecords(prev, result.profiles as APIProfile[]))

        const profileData =
          (session?.user?.id && result.profiles.find((profile) => profile.id === session.user.id)) ||
          result.profiles[0]

        if (profileData) {
          setProfile(profileData as APIProfile)
          setState((prev) => ({
            ...prev,
            userName: (profileData as APIProfile).display_name || prev.userName,
            isPremium: Boolean((profileData as APIProfile).is_premium),
            emergencyContacts: (profileData as APIProfile).emergency_contacts || prev.emergencyContacts,
          }))
        }
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

    const alertActions = actions.filter((action) => action.type === "SEND_ALERT")
    if (alertActions.length) {
      const latest = alertActions[alertActions.length - 1]
      const payload = latest.payload
      if (!isMessageDraftPayload(payload)) return
      const normalized = normalizeSOSMetadata({
        conversation_id: payload.conversation_id,
        body: payload.body,
        metadata: payload.metadata,
        created_at: payload.created_at,
        message_type: "sos",
      })

      if (normalized) {
        setState((prev) => ({
          ...prev,
          sosActive: normalized.status === "active",
          sosStatus:
            normalized.status === "active"
              ? "delivered"
              : normalized.status === "canceled"
                ? "canceled"
                : "resolved",
          lastSOSLocation: normalized.location ?? prev.lastSOSLocation,
        }))
      }
    }
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

  useEffect(() => {
    const tripId = state.currentTrip?.id
    if (!tripId) {
      setState((prev) =>
        prev.sosActive || prev.sosStatus !== "idle"
          ? { ...prev, sosActive: false, sosStatus: "idle" }
          : prev,
      )
      return
    }

    const sosMessages = messages
      .filter((message) => message.conversation_id === tripId)
      .map((message) => ({ message, meta: normalizeSOSMetadata(message) }))
      .filter((entry): entry is { message: MessageRecord; meta: NonNullable<ReturnType<typeof normalizeSOSMetadata>> } =>
        Boolean(entry.meta),
      )

    if (!sosMessages.length) {
      setState((prev) =>
        prev.sosStatus === "idle" && !prev.sosActive ? prev : { ...prev, sosActive: false, sosStatus: "idle" },
      )
      return
    }

    sosMessages.sort(
      (a, b) =>
        parseDate(a.message.created_at, new Date(0)).getTime() - parseDate(b.message.created_at, new Date(0)).getTime(),
    )
    const latest = sosMessages[sosMessages.length - 1]
    const desiredStatus: SOSStatus =
      latest.meta.status === "active"
        ? "delivered"
        : latest.meta.status === "canceled"
          ? "canceled"
          : "resolved"

    setState((prev) => {
      const nextLocation = latest.meta.location ?? prev.lastSOSLocation
      const unchangedLocation =
        (prev.lastSOSLocation === null && nextLocation === null) ||
        (prev.lastSOSLocation?.lat === nextLocation?.lat && prev.lastSOSLocation?.lng === nextLocation?.lng)

      if (
        prev.sosActive === (latest.meta.status === "active") &&
        prev.sosStatus === desiredStatus &&
        unchangedLocation
      ) {
        return prev
      }

      return {
        ...prev,
        sosActive: latest.meta.status === "active",
        sosStatus: desiredStatus,
        lastSOSLocation: nextLocation,
      }
    })
  }, [messages, state.currentTrip?.id])

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
        setBackendWaypoints((prev) => mergeRecords(prev, [result]))
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
        setBackendGroups((prev) => mergeRecords(prev, [result]))
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
        setBackendGeofences((prev) => mergeRecords(prev, [result]))
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error creating geofence:", error)
        throw error
      }
    },
    [flush, session, supabase],
  )

  const inviteToGroup = useCallback(
    async (groupId: string, email: string, role: "member" | "admin" = "member") => {
      if (!session) throw new Error("Sign-in required to invite to group")

      const result = await apiInviteToGroup(supabase, { groupId, email, role })
      setBackendGroupInvitations((prev) => mergeRecords(prev, [result]))
      await flush()
    },
    [flush, session, supabase],
  )

  const respondToInvitation = useCallback(
    async (invitationId: string, decision: "accept" | "decline") => {
      if (!session) throw new Error("Sign-in required to respond to invitation")

      const result = await apiRespondToGroupInvite(supabase, invitationId, decision)
      setBackendGroupInvitations((prev) => mergeRecords(prev, [result]))
      await flush()
    },
    [flush, session, supabase],
  )

  const joinGroup = useCallback(
    async (groupId: string) => {
      if (!session) throw new Error("Sign-in required to join group")
      const result = await apiJoinGroup(supabase, groupId)
      setBackendGroups((prev) => mergeRecords(prev, [result]))
      await flush()
    },
    [flush, session, supabase],
  )

  const leaveGroup = useCallback(
    async (groupId: string) => {
      if (!session) throw new Error("Sign-in required to leave group")

      await apiLeaveGroup(supabase, groupId)
      setBackendGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? {
                ...group,
                member_ids: group.member_ids.filter((id) => id !== session.user.id),
                member_roles: Object.fromEntries(
                  Object.entries(group.member_roles || {}).filter(([id]) => id !== session.user.id),
                ) as APIGroup["member_roles"],
              }
            : group,
        ),
      )
      await flush()
    },
    [flush, session, supabase],
  )

  const toggleGeofenceAlerts = useCallback(
    async (geofenceId: string, enabled: boolean) => {
      if (!session) throw new Error("Sign-in required to update geofence")
      const updated = await apiToggleGeofence(supabase, geofenceId, enabled)
      setBackendGeofences((prev) => mergeRecords(prev, [updated]))
      await flush()
    },
    [flush, session, supabase],
  )

  const updateGeofenceAlerts = useCallback(
    async (geofenceId: string, options: { notifyOnEntry: boolean; notifyOnExit: boolean; enabled?: boolean }) => {
      if (!session) throw new Error("Sign-in required to update geofence alerts")
      const updated = await apiUpdateGeofenceAlerts(supabase, {
        geofenceId,
        notifyOnEntry: options.notifyOnEntry,
        notifyOnExit: options.notifyOnExit,
        enabled: options.enabled,
      })
      setBackendGeofences((prev) => mergeRecords(prev, [updated]))
      await flush()
    },
    [flush, session, supabase],
  )

  const buildSOSPayload = useCallback(
    async (status: "active" | "canceled" | "resolved", silent: boolean, reason?: string) => {
      if (!session) throw new Error("Sign-in required to send SOS")
      const targetConversationId = state.currentTrip?.id || conversations[0]?.id

      if (!targetConversationId) {
        throw new Error("No active trip or group conversation available for SOS alerts")
      }

      const location = await captureSOSLocation()
      const created_at = new Date().toISOString()
      const body =
        status === "active"
          ? silent
            ? "Silent SOS triggered"
            : "SOS triggered"
          : status === "canceled"
            ? "SOS canceled - marked safe"
            : "SOS resolved - confirmed safe"

      const metadata = {
        type: "sos",
        status,
        silent,
        location: location
          ? { latitude: location.lat, longitude: location.lng, accuracy: location.accuracy }
          : undefined,
        contacts: state.emergencyContacts,
        tripId: state.currentTrip?.id ?? null,
        groupIds: state.groups.map((group) => group.id),
        reason: reason ?? undefined,
      }

      return { payload: { conversation_id: targetConversationId, body, metadata, created_at }, location }
    },
    [captureSOSLocation, conversations, session, state.currentTrip?.id, state.emergencyContacts, state.groups],
  )

  const dispatchSOS = useCallback(
    async (status: "active" | "canceled" | "resolved", silent = false, reason?: string) => {
      if (!session) throw new Error("Sign-in required to dispatch SOS")
      const { payload, location } = await buildSOSPayload(status, silent, reason)
      const actionId = uniqueId()
      const createdAt = payload.created_at || new Date().toISOString()

      enqueue({
        id: actionId,
        type: "SEND_ALERT",
        payload,
        createdAt,
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
          message_type: "sos",
        },
      ])

      setState((prev) => ({
        ...prev,
        sosActive: status === "active",
        sosStatus:
          status === "active"
            ? network.connectivity === "offline"
              ? "queued"
              : "sending"
            : status === "canceled"
              ? "canceled"
              : "resolved",
        lastSOSLocation: location ?? prev.lastSOSLocation,
      }))
    },
    [buildSOSPayload, enqueue, network.connectivity, session],
  )

  const triggerSOS = useCallback((silent: boolean) => dispatchSOS("active", silent), [dispatchSOS])

  const cancelSOS = useCallback(() => dispatchSOS("canceled", false, "user_canceled"), [dispatchSOS])

  const resolveSOS = useCallback(() => dispatchSOS("resolved", false, "user_resolved"), [dispatchSOS])

  // Convert backend waypoints and groups to UI format
  useEffect(() => {
    const profileMap = new Map(backendProfiles.map((profile) => [profile.id, profile]))
    const currentUserId = session?.user?.id

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
    const uiGroups: Group[] = backendGroups.map((g) => {
      const members = g.member_ids.map((id, index) => {
        const profile = profileMap.get(id)
        const role = (g.member_roles?.[id] as Group["members"][number]["role"]) ||
          (id === g.owner_id ? "owner" : "member")
        return {
          id,
          name: profile?.display_name || profile?.email || `Member ${index + 1}`,
          role,
        }
      })

      const role =
        (currentUserId && (g.member_roles?.[currentUserId] as Group["role"])) ||
        (currentUserId === g.owner_id ? "owner" : "member")

      return {
        id: g.id,
        name: g.name,
        description: g.description || "",
        members,
        waypoints: [], // Waypoints are managed separately
        role,
      }
    })

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
      groupId: geofence.group_id,
      conversationId: geofence.conversation_id,
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

    const uiInvitations: GroupInvitation[] = backendGroupInvitations.map((invite) => ({
      id: invite.id,
      groupId: invite.group_id,
      senderId: invite.sender_id,
      recipientId: invite.recipient_id,
      recipientEmail: invite.recipient_email,
      role: invite.role,
      status: invite.status,
      createdAt: new Date(invite.created_at),
    }))

    const uiActivity: GroupActivity[] = backendGroupActivity
      .map((activity) => ({
        id: activity.id,
        groupId: activity.group_id,
        actorId: activity.actor_id,
        actorName:
          profileMap.get(activity.actor_id)?.display_name ||
          profileMap.get(activity.actor_id)?.email ||
          "Member",
        type: activity.activity_type,
        description: activity.description || activity.activity_type,
        createdAt: new Date(activity.created_at),
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    setState((prev) => ({
      ...prev,
      waypoints: uiWaypoints,
      memberLocations: uiMemberLocations,
      groups: uiGroups,
      geofences: uiGeofences,
      groupInvitations: uiInvitations,
      groupActivity: uiActivity,
    }))
  }, [
    backendWaypoints,
    backendGroups,
    backendGeofences,
    backendProfiles,
    backendGroupInvitations,
    backendGroupActivity,
    session?.user?.id,
  ])

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
      inviteToGroup,
      respondToInvitation,
      joinGroup,
      leaveGroup,
      toggleGeofenceAlerts,
      updateGeofenceAlerts,
      triggerSOS,
      cancelSOS,
      resolveSOS,
    }),
    [
      addWaypoint,
      cancelSOS,
      checkIn,
      inviteToGroup,
      respondToInvitation,
      joinGroup,
      leaveGroup,
      createGeofence,
      createGroup,
      endTrip,
      lastSyncedAt,
      pending,
      profile,
      toggleGeofenceAlerts,
      updateGeofenceAlerts,
      refresh,
      session,
      signIn,
      signOut,
      startTrip,
      updateTrip,
      state,
      status,
      user,
      triggerSOS,
      resolveSOS,
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

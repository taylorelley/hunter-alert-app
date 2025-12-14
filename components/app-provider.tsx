"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Session, User } from "@supabase/supabase-js"
import { createSupabaseClient } from "@/lib/supabase/client"
import { getCustomerInfo, getOfferings, purchasePackage, restorePurchases, type BillingOffering } from "@/lib/billing/client"
import {
  authenticate,
  createGroup as apiCreateGroup,
  updateGroup as apiUpdateGroup,
  addWaypoint as apiAddWaypoint,
  deleteWaypoint as apiDeleteWaypoint,
  createGeofence as apiCreateGeofence,
  deleteGeofence as apiDeleteGeofence,
  inviteToGroup as apiInviteToGroup,
  respondToGroupInvite as apiRespondToGroupInvite,
  joinGroup as apiJoinGroup,
  leaveGroup as apiLeaveGroup,
  toggleGeofence as apiToggleGeofence,
  updateGeofence as apiUpdateGeofence,
  updateGeofenceAlerts as apiUpdateGeofenceAlerts,
  resendGroupInvitation as apiResendGroupInvitation,
  withdrawGroupInvitation as apiWithdrawGroupInvitation,
  recordDeviceSession,
  revokeDeviceSession as apiRevokeDeviceSession,
  listDeviceSessions,
  updateEmergencyContacts as apiUpdateEmergencyContacts,
  sendTestNotification as apiSendTestNotification,
  upsertPrivacySettings as apiUpsertPrivacySettings,
  upsertPushSubscription,
  togglePushSubscription,
  beginSmsVerification,
  confirmSmsVerification,
  updateSmsPreferences as apiUpdateSmsPreferences,
  dispatchSmsAlert,
} from "@/lib/supabase/api"
import { useNetwork } from "./network-provider"
import { useSyncEngine } from "@/lib/sync/use-sync-engine"
import { PendingAction, SyncStatus } from "@/lib/sync/types"
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
  DeviceSession,
  PrivacySettingsRow,
  PushSubscriptionRow,
  SmsAlertSubscriptionRow,
} from "@/lib/supabase/types"
import { Device } from "@capacitor/device"
import { persistCachedDeviceSessions, readCachedDeviceSessions } from "@/lib/storage/device-sessions"
import { getClientSessionId } from "@/lib/device/session-id"
import { requestPushRegistration } from "@/lib/push/registration"

export const FREE_MIN_CHECKIN_CADENCE_HOURS = 6
const FREE_HISTORY_DAYS = 14
const PREMIUM_HISTORY_DAYS = 90
const FREE_MAX_CHECK_INS = 20
const PREMIUM_MAX_CHECK_INS = 200

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

export interface EmergencyContact {
  id: string
  name: string
  phone?: string
  email?: string
  relationship?: string
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
  groupId: string | null
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

export interface PrivacySettings {
  shareLocation: boolean
  showOnMap: boolean
  shareTrips: boolean
  shareWaypoints: boolean
  notifyContacts: boolean
}

export interface PushSubscription {
  id: string
  token: string
  platform: string
  environment: "production" | "development" | "unknown"
  deviceSessionId: string | null
  enabled: boolean
  lastDeliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SmsAlertPreferences {
  phone: string
  status: "pending" | "verified" | "disabled"
  allowCheckIns: boolean
  allowSOS: boolean
  verificationExpiresAt: Date | null
  lastDispatchedAt: Date | null
}

const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  shareLocation: true,
  showOnMap: true,
  shareTrips: true,
  shareWaypoints: true,
  notifyContacts: true,
}

export interface DeviceSessionView {
  id: string
  label: string
  platform: string
  osVersion: string
  appVersion?: string | null
  lastSeen: Date
  revokedAt: Date | null
  isCurrent: boolean
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
  participant_ids?: string[]
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
  deviceSessions: DeviceSessionView[]
  currentDevice: DeviceSessionView | null
  checkInStatus: CheckInStatus
  nextCheckInDue: Date | null
  sosActive: boolean
  sosStatus: SOSStatus
  lastSOSLocation: SOSLocation | null
  userName: string
  emergencyContacts: EmergencyContact[]
  privacySettings: PrivacySettings
  pushSubscriptions: PushSubscription[]
  smsAlerts: SmsAlertPreferences | null
}

interface AppContextValue extends AppState {
  session: Session | null
  user: User | null
  profile: APIProfile | null
  pendingActions: PendingAction[]
  syncStatus: SyncStatus
  isSyncing: boolean
  lastSyncedAt: string | null
  billingOfferings: BillingOffering[]
  billingLoading: boolean
  billingError: string | null
  billingReceipt: string | null
  deviceSessionId: string | null
  addEmergencyContact: (contact: Omit<EmergencyContact, "id">) => Promise<void>
  updateEmergencyContact: (id: string, contact: Omit<EmergencyContact, "id">) => Promise<void>
  deleteEmergencyContact: (id: string) => Promise<void>
  sendTestContactNotification: (options: { contactId: string; channel?: "sms" | "email" }) => Promise<void>
  updatePrivacySettings: (settings: Partial<PrivacySettings>) => Promise<void>
  registerPushSubscription: () => Promise<void>
  togglePushSubscription: (id: string, enabled: boolean) => Promise<void>
  beginSmsOptIn: (params: { phone: string; allowCheckIns?: boolean; allowSOS?: boolean }) => Promise<void>
  verifySmsCode: (code: string) => Promise<void>
  updateSmsPreferences: (changes: Partial<{ allowCheckIns: boolean; allowSOS: boolean; status: SmsAlertPreferences["status"] }>) => Promise<void>
  signUp: (params: { email: string; password: string; displayName?: string }) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  refreshDeviceSessions: () => Promise<void>
  revokeDeviceSession: (sessionId: string) => Promise<void>
  purchasePremium: (packageId?: string, offeringId?: string) => Promise<void>
  restorePremium: () => Promise<void>
  startTrip: (trip: Omit<Trip, "id" | "checkIns" | "status">) => Promise<void>
  updateTrip: (tripId: string, trip: Omit<Trip, "id" | "checkIns">) => Promise<void>
  endTrip: () => Promise<void>
  deleteTrip: (tripId: string) => Promise<void>
  checkIn: (status: "ok" | "need-help", notes: string) => Promise<void>
  addWaypoint: (waypoint: Omit<Waypoint, "id" | "createdAt">) => Promise<void>
  deleteWaypoint: (waypointId: string) => Promise<void>
  createGroup: (name: string, description?: string) => Promise<void>
  updateGroup: (groupId: string, updates: { name?: string; description?: string }) => Promise<void>
  createGeofence: (params: {
    name: string
    latitude: number
    longitude: number
    radiusMeters?: number
    description?: string
    groupId?: string
    conversationId?: string
  }) => Promise<void>
  updateGeofence: (
    geofenceId: string,
    updates: { name: string; latitude: number; longitude: number; radiusMeters: number; description?: string },
  ) => Promise<void>
  deleteGeofence: (geofenceId: string) => Promise<void>
  inviteToGroup: (groupId: string, email: string, role?: "member" | "admin") => Promise<void>
  resendGroupInvitation: (invitationId: string) => Promise<void>
  withdrawGroupInvitation: (invitationId: string) => Promise<void>
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

function normalizeEmergencyContacts(value: unknown): EmergencyContact[] {
  if (!Array.isArray(value)) return []

  return value.reduce<EmergencyContact[]>((contacts, entry, index) => {
    if (!entry || typeof entry !== "object") return contacts

    const raw = entry as Record<string, unknown>
    const name = typeof raw.name === "string" ? raw.name.trim() : ""
    const phone = typeof raw.phone === "string" ? raw.phone.trim() : undefined
    const email = typeof raw.email === "string" ? raw.email.trim() : undefined
    const relationship = typeof raw.relationship === "string" ? raw.relationship.trim() : undefined

    if (!name || (!phone && !email)) return contacts

    const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id : `${uniqueId()}-${index}`

    contacts.push({ id, name, phone, email, relationship })
    return contacts
  }, [])
}

function normalizePrivacySettings(value: PrivacySettingsRow | null | undefined): PrivacySettings {
  return {
    shareLocation: value?.share_location ?? DEFAULT_PRIVACY_SETTINGS.shareLocation,
    showOnMap: value?.show_on_map ?? DEFAULT_PRIVACY_SETTINGS.showOnMap,
    shareTrips: value?.share_trips ?? DEFAULT_PRIVACY_SETTINGS.shareTrips,
    shareWaypoints: value?.share_waypoints ?? DEFAULT_PRIVACY_SETTINGS.shareWaypoints,
    notifyContacts: value?.notify_contacts ?? DEFAULT_PRIVACY_SETTINGS.notifyContacts,
  }
}

async function getDeviceDescriptor() {
  if (typeof window === "undefined") {
    return {
      model: "server",
      platform: "server",
      osVersion: "",
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
      metadata: {},
    }
  }

  try {
    const info = await Device.getInfo()
    return {
      model: info.model || info.name || "Unknown device",
      platform: info.platform || info.operatingSystem || "unknown",
      osVersion: info.osVersion || info.operatingSystem || "",
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
      metadata: {
        manufacturer: info.manufacturer,
        platform: info.platform,
        operatingSystem: info.operatingSystem,
      },
    }
  } catch (error) {
    console.warn("Unable to collect device info", error)
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "unknown"
    return {
      model: "Web Client",
      platform: "web",
      osVersion: ua,
      appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
      metadata: {},
    }
  }
}

function mapDeviceSessionsToView(
  sessions: DeviceSession[],
  currentSessionId: string | null,
): DeviceSessionView[] {
  return sessions
    .map((session) => {
      const lastSeen = parseDate(session.last_seen || session.updated_at || session.created_at, new Date())
      const revokedAt = session.revoked_at ? parseDate(session.revoked_at, new Date()) : null

      return {
        id: session.id,
        label: session.device_model || "Unknown device",
        platform: session.platform || "unknown",
        osVersion: session.os_version || "",
        appVersion: session.app_version,
        lastSeen,
        revokedAt,
        isCurrent: session.client_session_id === currentSessionId,
      }
    })
    .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
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

function clampCheckIns(checkIns: CheckIn[], isPremium: boolean): CheckIn[] {
  const max = isPremium ? PREMIUM_MAX_CHECK_INS : FREE_MAX_CHECK_INS
  const horizonDays = isPremium ? PREMIUM_HISTORY_DAYS : FREE_HISTORY_DAYS
  const cutoff = Date.now() - horizonDays * 24 * 60 * 60 * 1000
  return checkIns.filter((checkIn) => checkIn.timestamp.getTime() >= cutoff).slice(0, max)
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
  const [backendDeviceSessions, setBackendDeviceSessions] = useState<DeviceSession[]>([])
  const [backendPrivacySettings, setBackendPrivacySettings] = useState<
    (PrivacySettingsRow & { id: string })[]
  >([])
  const [backendPushSubscriptions, setBackendPushSubscriptions] = useState<PushSubscriptionRow[]>([])
  const [backendSmsAlerts, setBackendSmsAlerts] = useState<(SmsAlertSubscriptionRow & { id: string })[]>([])
  const [syncCursor, setSyncCursor] = useState<string | null>(null)
  const [billingOfferings, setBillingOfferings] = useState<BillingOffering[]>([])
  const [billingReceipt, setBillingReceipt] = useState<string | null>(null)
  const [billingError, setBillingError] = useState<string | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const [deviceSessionId] = useState<string | null>(() => (typeof window === "undefined" ? null : getClientSessionId()))
  const revocationCheckRef = useRef(false)

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
    deviceSessions: [],
    currentDevice: null,
    checkInStatus: "pending",
    nextCheckInDue: null,
    sosActive: false,
    sosStatus: "idle",
    lastSOSLocation: null,
    userName: "Guest",
    emergencyContacts: [],
    privacySettings: DEFAULT_PRIVACY_SETTINGS,
    pushSubscriptions: [],
    smsAlerts: null,
  })

  useEffect(() => {
    readCachedDeviceSessions().then((cached) => {
      if (cached.length) {
        setBackendDeviceSessions((prev) => (prev.length ? prev : cached))
      }
    })
  }, [])

  useEffect(() => {
    persistCachedDeviceSessions(backendDeviceSessions)
  }, [backendDeviceSessions])

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

  const signUp = useCallback(
    async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error

      const newUser = data.user
      const newSession = data.session ?? null
      if (newSession) setSession(newSession)
      if (newUser) setUser(newUser)

      if (!newUser) return

      const profilePayload: APIProfile = {
        id: newUser.id,
        display_name: displayName || newUser.email || "New hunter",
        avatar_url: null,
        email: newUser.email ?? null,
        phone: newUser.phone ?? null,
        emergency_contacts: [],
        is_premium: false,
        privacy_settings: { shareLocation: true, showOnMap: true, notifyContacts: true },
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: profileError } = await supabase.from("profiles").upsert({
        id: profilePayload.id,
        display_name: profilePayload.display_name,
        avatar_url: profilePayload.avatar_url,
        email: profilePayload.email,
        phone: profilePayload.phone,
        emergency_contacts: profilePayload.emergency_contacts,
        is_premium: profilePayload.is_premium,
        privacy_settings: profilePayload.privacy_settings,
        metadata: profilePayload.metadata,
      })

      if (profileError) throw profileError

      await apiUpsertPrivacySettings(supabase, {
        user_id: profilePayload.id,
        share_location: true,
        show_on_map: true,
        share_trips: true,
        share_waypoints: true,
        notify_contacts: true,
      })

      setProfile(profilePayload)
      setBackendProfiles((prev) => mergeRecords(prev, [profilePayload]))
      setState((prev) => ({
        ...prev,
        userName: profilePayload.display_name || prev.userName,
        isPremium: false,
        emergencyContacts: normalizeEmergencyContacts(profilePayload.emergency_contacts ?? prev.emergencyContacts),
      }))
    },
    [supabase],
  )

  const refreshDeviceSessions = useCallback(async () => {
    if (!session) return
    try {
      const records = await listDeviceSessions(supabase)
      setBackendDeviceSessions((prev) => mergeRecords(prev, records))
    } catch (error) {
      console.warn("Unable to refresh device sessions:", error)
    }
  }, [session, supabase])

  const upsertDeviceSession = useCallback(
    async (activeSession?: Session | null) => {
      const workingSession = activeSession ?? session
      if (!supabase || !workingSession || !deviceSessionId) return

      try {
        const descriptor = await getDeviceDescriptor()
        const record = await recordDeviceSession(supabase, {
          client_session_id: deviceSessionId,
          device_model: descriptor.model,
          platform: descriptor.platform,
          os_version: descriptor.osVersion,
          app_version: descriptor.appVersion,
          metadata: descriptor.metadata,
        })
        setBackendDeviceSessions((prev) => mergeRecords(prev, [record]))
      } catch (error) {
        console.warn("Unable to record device session", error)
      }
    },
    [deviceSessionId, session, supabase],
  )

  const revokeDeviceSession = useCallback(
    async (targetId: string) => {
      if (!session) throw new Error("Sign-in required to revoke device session")
      const record = await apiRevokeDeviceSession(supabase, targetId)
      setBackendDeviceSessions((prev) => mergeRecords(prev, [record]))
    },
    [session, supabase],
  )

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await authenticate(supabase, email, password)
      setSession(result.session)
      setUser(result.user)
      revocationCheckRef.current = false
      await upsertDeviceSession(result.session)
      await refreshDeviceSessions()
    },
    [refreshDeviceSessions, supabase, upsertDeviceSession],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setBillingOfferings([])
    setBillingReceipt(null)
    setBillingError(null)
    setBillingLoading(false)
    setConversations([])
    setMessages([])
    setBackendGroups([])
    setBackendGroupInvitations([])
    setBackendGroupActivity([])
    setBackendWaypoints([])
    setBackendGeofences([])
    setBackendProfiles([])
    setBackendDeviceSessions([])
    setBackendPushSubscriptions([])
    setBackendSmsAlerts([])
    persistCachedDeviceSessions([])
    revocationCheckRef.current = false
    setState({
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
      deviceSessions: [],
      currentDevice: null,
      checkInStatus: "pending",
      nextCheckInDue: null,
      sosActive: false,
      sosStatus: "idle",
      lastSOSLocation: null,
      userName: "Guest",
      emergencyContacts: [],
      privacySettings: DEFAULT_PRIVACY_SETTINGS,
      pushSubscriptions: [],
      smsAlerts: null,
    })
  }, [network.connectivity, supabase])

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
        emergencyContacts: normalizeEmergencyContacts(profileData.emergency_contacts ?? prev.emergencyContacts),
      }))
    }
  }, [session, supabase])

  const persistEmergencyContacts = useCallback(
    async (contacts: EmergencyContact[]) => {
      if (!session) throw new Error("Sign-in required to update emergency contacts")
      const updated = await apiUpdateEmergencyContacts(supabase, contacts)
      const normalized = normalizeEmergencyContacts(updated)

      setProfile((prev) => (prev ? { ...prev, emergency_contacts: updated as APIProfile["emergency_contacts"] } : prev))
      setBackendProfiles((prev) => {
        if (!session?.user?.id) return prev
        const existingProfile = prev.find((profile) => profile.id === session.user.id)
        const baseProfile = existingProfile || profile || ({ id: session.user.id } as APIProfile)
        const mergedProfile = { ...baseProfile, emergency_contacts: updated }
        return mergeRecords(prev, [mergedProfile])
      })

      setState((prev) => ({ ...prev, emergencyContacts: normalized }))
    },
    [profile, session, supabase],
  )

  const addEmergencyContact = useCallback(
    async (contact: Omit<EmergencyContact, "id">) => {
      const nextContact: EmergencyContact = { ...contact, id: uniqueId() }
      await persistEmergencyContacts([...state.emergencyContacts, nextContact])
    },
    [persistEmergencyContacts, state.emergencyContacts],
  )

  const updateEmergencyContact = useCallback(
    async (id: string, contact: Omit<EmergencyContact, "id">) => {
      const exists = state.emergencyContacts.some((entry) => entry.id === id)
      if (!exists) throw new Error("Contact not found")
      const nextContacts = state.emergencyContacts.map((entry) =>
        entry.id === id ? { ...entry, ...contact, id } : entry,
      )
      await persistEmergencyContacts(nextContacts)
    },
    [persistEmergencyContacts, state.emergencyContacts],
  )

  const deleteEmergencyContact = useCallback(
    async (id: string) => {
      const nextContacts = state.emergencyContacts.filter((entry) => entry.id !== id)
      await persistEmergencyContacts(nextContacts)
    },
    [persistEmergencyContacts, state.emergencyContacts],
  )

  const sendTestContactNotification = useCallback(
    async (options: { contactId: string; channel?: "sms" | "email" }) => {
      if (!session) throw new Error("Sign-in required to send test notifications")
      const target = state.emergencyContacts.find((entry) => entry.id === options.contactId)
      if (!target) throw new Error("Contact not found")
      await apiSendTestNotification(supabase, { contact: target, channel: options.channel })
    },
    [session, state.emergencyContacts, supabase],
  )

  const updatePrivacySettings = useCallback(
    async (settings: Partial<PrivacySettings>) => {
      if (!session?.user?.id) throw new Error("Sign-in required to update privacy settings")

      const existing = backendPrivacySettings.find((entry) => entry.user_id === session.user!.id)
      const current = normalizePrivacySettings(existing)
      const next = { ...current, ...settings }

      setState((prev) => ({ ...prev, privacySettings: next }))

      try {
        const saved = await apiUpsertPrivacySettings(supabase, {
          user_id: session.user.id,
          share_location: next.shareLocation,
          show_on_map: next.showOnMap,
          share_trips: next.shareTrips,
          share_waypoints: next.shareWaypoints,
          notify_contacts: next.notifyContacts,
        })

        setBackendPrivacySettings((prev) => mergeRecords(prev, [{ ...saved, id: saved.user_id }]))
      } catch (error) {
        console.error("Unable to update privacy settings", error)
        setState((prev) => ({ ...prev, privacySettings: current }))
        throw error
      }
    },
    [backendPrivacySettings, session?.user?.id, supabase],
  )

  const registerPushSubscription = useCallback(async () => {
    if (!session) throw new Error("Sign-in required to enable push notifications")
    if (network.connectivity === "offline") {
      throw new Error("Connect to the network to enable push notifications")
    }
    try {
      const registration = await requestPushRegistration()
      const record = await upsertPushSubscription(supabase, {
        token: registration.token,
        deviceSessionId,
        platform: registration.platform,
        environment: registration.environment,
      })

      setBackendPushSubscriptions((prev) => mergeRecords(prev, [record]))
    } catch (error) {
      console.error("Failed to register push subscription:", error)
      throw new Error("Unable to enable push notifications. Please try again.")
    }
  }, [deviceSessionId, network.connectivity, session, supabase])

  const togglePushSubscriptionSetting = useCallback(
    async (id: string, enabled: boolean) => {
      if (!session) throw new Error("Sign-in required to update push notifications")
      if (network.connectivity === "offline") {
        throw new Error("Connect to the network to update push notifications")
      }
      try {
        const record = await togglePushSubscription(supabase, id, enabled)
        setBackendPushSubscriptions((prev) => mergeRecords(prev, [record]))
      } catch (error) {
        console.error("Failed to update push subscription:", error)
        throw new Error("Unable to update push notifications. Please try again.")
      }
    },
    [network.connectivity, session, supabase],
  )

  const beginSmsOptIn = useCallback(
    async ({ phone, allowCheckIns, allowSOS }: { phone: string; allowCheckIns?: boolean; allowSOS?: boolean }) => {
      if (!session) throw new Error("Sign-in required to enable SMS alerts")
      if (network.connectivity === "offline") {
        throw new Error("Connect to the network to start SMS verification")
      }
      try {
        const record = await beginSmsVerification(supabase, { phone, allowCheckIns, allowSos: allowSOS })
        setBackendSmsAlerts((prev) => mergeRecords(prev, [{ ...record, id: record.user_id }]))
      } catch (error) {
        console.error("Failed to start SMS verification:", error)
        throw new Error("Unable to start SMS verification. Please try again.")
      }
    },
    [network.connectivity, session, supabase],
  )

  const verifySmsCode = useCallback(
    async (code: string) => {
      if (!session) throw new Error("Sign-in required to verify SMS alerts")
      if (network.connectivity === "offline") {
        throw new Error("Connect to the network to verify SMS alerts")
      }
      try {
        const record = await confirmSmsVerification(supabase, code)
        setBackendSmsAlerts((prev) => mergeRecords(prev, [{ ...record, id: record.user_id }]))
      } catch (error) {
        console.error("Failed to verify SMS code:", error)
        throw new Error("Unable to verify SMS alerts. Please try again.")
      }
    },
    [network.connectivity, session, supabase],
  )

  const updateSmsPreferences = useCallback(
    async (changes: Partial<{ allowCheckIns: boolean; allowSOS: boolean; status: SmsAlertPreferences["status"] }>) => {
      if (!session) throw new Error("Sign-in required to update SMS alerts")
      if (network.connectivity === "offline") {
        throw new Error("Connect to the network to update SMS alerts")
      }
      try {
        const record = await apiUpdateSmsPreferences(supabase, {
          allow_checkins: changes.allowCheckIns,
          allow_sos: changes.allowSOS,
          status: changes.status,
        })
        setBackendSmsAlerts((prev) => mergeRecords(prev, [{ ...record, id: record.user_id }]))
      } catch (error) {
        console.error("Failed to update SMS preferences:", error)
        throw new Error("Unable to update SMS alerts. Please try again.")
      }
    },
    [network.connectivity, session, supabase],
  )

  const persistEntitlement = useCallback(
    async (active: boolean, receipt?: string | null) => {
      const previousIsPremium = state.isPremium
      const previousReceipt = billingReceipt
      setState((prev) => ({ ...prev, isPremium: active }))
      setBillingReceipt((prev) => receipt ?? prev)
      if (!session) return active

      const baseProfile =
        profile || backendProfiles.find((item) => item.id === session.user.id) ||
        ({ id: session.user.id } as APIProfile)

      const updatedProfile = { ...baseProfile, is_premium: active }

      const attemptPersist = async () =>
        supabase.from("profiles").update({ is_premium: active }).eq("id", session.user.id)

      const firstAttempt = await attemptPersist()
      const retryAttempt = firstAttempt.error ? await attemptPersist() : firstAttempt

      if (retryAttempt.error) {
        console.error("Failed to persist entitlement", retryAttempt.error)
        setBillingError(retryAttempt.error.message)
        setState((prev) => ({ ...prev, isPremium: previousIsPremium }))
        setBillingReceipt(previousReceipt)
        return previousIsPremium
      }

      setBillingError(null)
      setProfile((prev) => (prev ? { ...prev, is_premium: active } : prev))
      setBackendProfiles((prev) => mergeRecords(prev, [updatedProfile]))
      return active
    },
    [backendProfiles, billingReceipt, profile, session, state.isPremium, supabase],
  )

  const persistEntitlementRef = useRef(persistEntitlement)

  useEffect(() => {
    persistEntitlementRef.current = persistEntitlement
  }, [persistEntitlement])

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
      setBackendDeviceSessions((prev) => mergeRecords(prev, result.device_sessions ?? []))
      setBackendPushSubscriptions((prev) => mergeRecords(prev, result.push_subscriptions ?? []))

      if (result.sms_alert_subscriptions && result.sms_alert_subscriptions.length > 0) {
        const withIds = result.sms_alert_subscriptions.map((entry) => ({ ...entry, id: entry.user_id }))
        setBackendSmsAlerts((prev) => mergeRecords(prev, withIds))
      }

      if (result.privacy_settings && result.privacy_settings.length > 0) {
        const withIds = result.privacy_settings.map((entry) => ({ ...entry, id: entry.user_id }))
        setBackendPrivacySettings((prev) => mergeRecords(prev, withIds))
      }

      if (result.profiles && result.profiles.length > 0) {
        setBackendProfiles((prev) => mergeRecords(prev, result.profiles as APIProfile[]))

        const profileData =
          (session?.user?.id && result.profiles.find((profile) => profile.id === session.user.id)) ||
          result.profiles[0]

        if (profileData) {
          const privacy =
            backendPrivacySettings.find((entry) => entry.user_id === profileData.id) ||
            result.privacy_settings?.find((entry) => entry.user_id === profileData.id)
          setProfile(profileData as APIProfile)
          setState((prev) => ({
            ...prev,
            userName: (profileData as APIProfile).display_name || prev.userName,
            isPremium: Boolean((profileData as APIProfile).is_premium),
            emergencyContacts: normalizeEmergencyContacts(
              (profileData as APIProfile).emergency_contacts ?? prev.emergencyContacts,
            ),
            privacySettings: normalizePrivacySettings(privacy ?? result.privacy_settings?.[0]),
          }))
        }
      }
    },
    [backendPrivacySettings, session?.user?.id],
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

  const loadBillingOfferings = useCallback(async () => {
    try {
      const offerings = await getOfferings(session?.user?.id)
      setBillingOfferings(offerings)
      setBillingError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load purchase options"
      setBillingError(message)
    }
  }, [session?.user?.id])

  const refreshBillingEntitlement = useCallback(async () => {
    if (!session?.user?.id) return
    setBillingLoading(true)
    setBillingError(null)
    try {
      const result = await getCustomerInfo(session.user.id)
      if (!result) {
        setBillingError("Subscription status unavailable on this device.")
        return
      }

      await persistEntitlementRef.current(result.entitlementActive, result.receipt ?? null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh purchases"
      setBillingError(message)
    } finally {
      setBillingLoading(false)
    }
  }, [session?.user?.id])

  const purchasePremium = useCallback(
    async (packageId?: string, offeringId?: string) => {
      if (!session) throw new Error("Sign-in required before purchasing")
      const targetOffering = offeringId || billingOfferings[0]?.id
      const targetPackage = packageId || billingOfferings[0]?.packages[0]?.id || "pro_monthly"
      setBillingLoading(true)
      setBillingError(null)
      try {
        const result = await purchasePackage(targetPackage, targetOffering, session.user.id)
        if (!result) {
          setBillingError("Purchases are currently unavailable on this device.")
          return
        }
        await persistEntitlement(result.entitlementActive, result.receipt ?? null)
        if (!result.entitlementActive) {
          setBillingError("Purchase completed but entitlement is inactive. Restore purchases or contact support.")
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to complete purchase"
        setBillingError(message)
        throw error
      } finally {
        setBillingLoading(false)
      }
    },
    [billingOfferings, persistEntitlement, session],
  )

  const restorePremium = useCallback(async () => {
    if (!session) throw new Error("Sign-in required to restore purchases")
    setBillingLoading(true)
    setBillingError(null)
    try {
      const result = await restorePurchases(session.user.id)
      if (!result) {
        setBillingError("Purchases are currently unavailable on this device.")
        return
      }
      await persistEntitlement(result.entitlementActive, result.receipt ?? null)
      if (!result.entitlementActive) {
        setBillingError("No active subscriptions were found to restore.")
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to restore purchases"
      setBillingError(message)
      throw error
    } finally {
      setBillingLoading(false)
    }
  }, [persistEntitlement, session])

  const refresh = useCallback(async () => {
    await refreshProfile()
    await refreshBillingEntitlement()
    await refreshDeviceSessions()
    await flush()
  }, [flush, refreshBillingEntitlement, refreshDeviceSessions, refreshProfile])

  useEffect(() => {
    if (!deviceSessionId || !session) return
    const matching = backendDeviceSessions.find((entry) => entry.client_session_id === deviceSessionId)
    if (matching?.revoked_at && !revocationCheckRef.current) {
      revocationCheckRef.current = true
      signOut()
    }
  }, [backendDeviceSessions, deviceSessionId, session, signOut])

  useEffect(() => {
    setState((prev) => ({ ...prev, isOnline: network.connectivity !== "offline" }))
  }, [network.connectivity])

  useEffect(() => {
    if (!session?.user?.id) return
    const privacy = backendPrivacySettings.find((entry) => entry.user_id === session.user.id)
    if (privacy) {
      setState((prev) => ({ ...prev, privacySettings: normalizePrivacySettings(privacy) }))
    }
  }, [backendPrivacySettings, session?.user?.id])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session)
        setUser(data.session.user)
        upsertDeviceSession(data.session)
        refreshDeviceSessions()
      }
    })
  }, [refreshDeviceSessions, supabase, upsertDeviceSession])

  useEffect(() => {
    if (user && session) {
      refreshProfile()
      flush()
    }
  }, [flush, refreshProfile, session, user])

  useEffect(() => {
    loadBillingOfferings()
  }, [loadBillingOfferings])

  useEffect(() => {
    if (!session) return
    refreshBillingEntitlement()
  }, [refreshBillingEntitlement, session])

  useEffect(() => {
    if (!conversations.length) {
      setState((prev) => ({ ...prev, currentTrip: null, trips: [], checkInStatus: "pending", nextCheckInDue: null }))
      return
    }

    const privacyMap = new Map(
      backendPrivacySettings.map((entry) => [entry.user_id, normalizePrivacySettings(entry)]),
    )

    const allowedConversations = conversations.filter((conversation) => {
      const participants = (conversation.participant_ids as string[] | undefined) ?? []
      const otherParticipants = participants.filter((id) => id !== session?.user?.id)
      return !otherParticipants.some((id) => privacyMap.get(id)?.shareTrips === false)
    })

    const mappedTrips = allowedConversations
      .map((conversation) => mapConversationToTrip(conversation, messages))
      .map((trip) => ({
        ...trip,
        checkIns: clampCheckIns(trip.checkIns, state.isPremium),
        checkInCadence: state.isPremium
          ? trip.checkInCadence
          : Math.max(trip.checkInCadence, FREE_MIN_CHECKIN_CADENCE_HOURS),
      }))
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
  }, [backendPrivacySettings, conversations, messages, session?.user?.id, state.isPremium])

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
      const normalizedCadence = state.isPremium
        ? trip.checkInCadence
        : Math.max(trip.checkInCadence, FREE_MIN_CHECKIN_CADENCE_HOURS)
      const metadata = {
        destination: trip.destination,
        notes: trip.notes,
        checkInCadence: normalizedCadence,
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
    [flush, session, state.isPremium, supabase],
  )

  const updateTrip = useCallback(
    async (tripId: string, trip: Omit<Trip, "id" | "checkIns">) => {
      if (!session) throw new Error("Sign-in required before updating a trip")

      const normalizedCadence = state.isPremium
        ? trip.checkInCadence
        : Math.max(trip.checkInCadence, FREE_MIN_CHECKIN_CADENCE_HOURS)
      const metadata = {
        destination: trip.destination,
        notes: trip.notes,
        checkInCadence: normalizedCadence,
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
    [flush, session, state.isPremium, supabase],
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

  const deleteTrip = useCallback(
    async (tripId: string) => {
      if (!session) throw new Error("Sign-in required to delete trip")

      try {
        const { error } = await supabase.from("conversations").delete().eq("id", tripId)

        if (error) throw error

        // Update local state
        setConversations((prev) => prev.filter((conversation) => conversation.id !== tripId))

        // If deleting the current trip, clear it from state
        setState((prev) => ({
          ...prev,
          currentTrip: prev.currentTrip?.id === tripId ? null : prev.currentTrip,
          trips: prev.trips.filter((trip) => trip.id !== tripId),
        }))

        await flush()
      } catch (error) {
        console.error("Error deleting trip:", error)
        throw error
      }
    },
    [flush, session, supabase],
  )

  const checkIn = useCallback(
    async (statusValue: "ok" | "need-help", notes: string) => {
      if (!state.currentTrip || !session) throw new Error("Active trip and session required to check in")
      const enforcedCadenceHours = state.isPremium
        ? state.currentTrip.checkInCadence
        : Math.max(state.currentTrip.checkInCadence, FREE_MIN_CHECKIN_CADENCE_HOURS)
      const lastCheckIn = state.currentTrip.checkIns[0]
      if (!state.isPremium && lastCheckIn) {
        const nextWindow = lastCheckIn.timestamp.getTime() + enforcedCadenceHours * 60 * 60 * 1000
        if (Date.now() < nextWindow) {
          throw new Error(
            `High-frequency check-ins are reserved for Pro. Next check-in available at ${new Date(nextWindow).toLocaleString()}`,
          )
        }
      }
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

      if (
        state.smsAlerts?.status === "verified" &&
        state.smsAlerts.allowCheckIns &&
        network.connectivity !== "offline"
      ) {
        dispatchSmsAlert(supabase, {
          type: "checkin",
          message: payload.body,
          tripId: state.currentTrip.id,
          checkInId: actionId,
        }).catch((error) => console.warn("SMS dispatch failed", error))
      }
    },
    [enqueue, network.connectivity, session, state.currentTrip, state.isPremium, state.smsAlerts, supabase],
  )

  const addWaypoint = useCallback(
    async (waypoint: Omit<Waypoint, "id" | "createdAt">) => {
      if (!session) throw new Error("Sign-in required to add waypoint")

      try {
        const allowSharing = state.privacySettings.shareWaypoints
        const result = await apiAddWaypoint(supabase, {
          name: waypoint.name,
          latitude: waypoint.coordinates.lat,
          longitude: waypoint.coordinates.lng,
          type: waypoint.type,
          description: waypoint.notes,
          tripId: state.currentTrip?.id,
          shared: allowSharing ? !waypoint.isPrivate : false,
        })

        // Optimistically update local state
        setBackendWaypoints((prev) => mergeRecords(prev, [result]))
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error adding waypoint:", error)
        throw error
      }
    },
    [flush, session, state.currentTrip?.id, state.privacySettings.shareWaypoints, supabase],
  )

  const deleteWaypoint = useCallback(
    async (waypointId: string) => {
      if (!session) throw new Error("Sign-in required to delete waypoint")

      try {
        await apiDeleteWaypoint(supabase, waypointId)

        // Optimistically update local state
        setBackendWaypoints((prev) => prev.filter((waypoint) => waypoint.id !== waypointId))
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error deleting waypoint:", error)
        throw error
      }
    },
    [flush, session, supabase],
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

  const updateGroup = useCallback(
    async (groupId: string, updates: { name?: string; description?: string }) => {
      if (!session) throw new Error("Sign-in required to update group")

      try {
        const result = await apiUpdateGroup(supabase, groupId, updates)
        setBackendGroups((prev) => mergeRecords(prev, [result]))
        await flush() // Trigger sync to get latest data
      } catch (error) {
        console.error("Error updating group:", error)
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

  const updateGeofence = useCallback(
    async (
      geofenceId: string,
      updates: { name: string; latitude: number; longitude: number; radiusMeters: number; description?: string },
    ) => {
      if (!session) throw new Error("Sign-in required to update geofence")

      const updated = await apiUpdateGeofence(supabase, { geofenceId, ...updates })
      setBackendGeofences((prev) => mergeRecords(prev, [updated]))
      await flush()
    },
    [flush, session, supabase],
  )

  const deleteGeofence = useCallback(
    async (geofenceId: string) => {
      if (!session) throw new Error("Sign-in required to delete geofence")

      await apiDeleteGeofence(supabase, geofenceId)
      setBackendGeofences((prev) => prev.filter((geofence) => geofence.id !== geofenceId))
      await flush()
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

  const resendGroupInvitation = useCallback(
    async (invitationId: string) => {
      if (!session) throw new Error("Sign-in required to resend invitation")

      const result = await apiResendGroupInvitation(supabase, invitationId)
      setBackendGroupInvitations((prev) => mergeRecords(prev, [result]))
      await flush()
    },
    [flush, session, supabase],
  )

  const withdrawGroupInvitation = useCallback(
    async (invitationId: string) => {
      if (!session) throw new Error("Sign-in required to update invitation")

      const result = await apiWithdrawGroupInvitation(supabase, invitationId)
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

      const allowLocation = state.privacySettings.shareLocation && state.privacySettings.showOnMap
      const location = allowLocation ? await captureSOSLocation() : null
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
    [
      captureSOSLocation,
      conversations,
      session,
      state.currentTrip?.id,
      state.emergencyContacts,
      state.groups,
      state.privacySettings,
    ],
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

      if (
        state.smsAlerts?.status === "verified" &&
        state.smsAlerts.allowSOS &&
        network.connectivity !== "offline"
      ) {
        dispatchSmsAlert(supabase, {
          type: "sos",
          message: payload.body,
          tripId: state.currentTrip?.id,
          checkInId: actionId,
          location: payload.metadata?.location,
        }).catch((error) => console.warn("SMS SOS dispatch failed", error))
      }
    },
    [
      buildSOSPayload,
      enqueue,
      network.connectivity,
      session,
      state.currentTrip?.id,
      state.smsAlerts,
      supabase,
    ],
  )

  const triggerSOS = useCallback((silent: boolean) => dispatchSOS("active", silent), [dispatchSOS])

  const cancelSOS = useCallback(() => dispatchSOS("canceled", false, "user_canceled"), [dispatchSOS])

  const resolveSOS = useCallback(() => dispatchSOS("resolved", false, "user_resolved"), [dispatchSOS])

  // Convert backend waypoints and groups to UI format
  useEffect(() => {
    const profileMap = new Map(backendProfiles.map((profile) => [profile.id, profile]))
    const currentUserId = session?.user?.id
    const privacyMap = new Map(
      backendPrivacySettings.map((entry) => [entry.user_id, normalizePrivacySettings(entry)]),
    )

    // Convert backend waypoints to UI format
    const uiWaypoints: Waypoint[] = backendWaypoints
      .map((wp) => {
        const ownerPrivacy = privacyMap.get(wp.user_id)
        if (wp.user_id !== currentUserId && ownerPrivacy?.shareWaypoints === false) return null
        if (wp.user_id !== currentUserId && !wp.shared) return null

        return {
          id: wp.id,
          name: wp.name,
          type: wp.waypoint_type as Waypoint["type"],
          coordinates: { lat: wp.latitude, lng: wp.longitude },
          notes: wp.description || "",
          groupId: wp.group_id ?? null,
          isPrivate: !wp.shared,
          createdAt: new Date(wp.created_at),
        }
      })
      .filter((wp): wp is Waypoint => Boolean(wp))

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
        const privacy = privacyMap.get(profile.id) ?? DEFAULT_PRIVACY_SETTINGS
        if (profile.id !== currentUserId && (!privacy.shareLocation || !privacy.showOnMap)) {
          return null
        }

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

    const deviceSessionViews = mapDeviceSessionsToView(backendDeviceSessions, deviceSessionId)
    const currentDevice = deviceSessionViews.find((entry) => entry.isCurrent) ?? null

    const pushSubscriptions: PushSubscription[] = backendPushSubscriptions.map((entry) => ({
      id: entry.id,
      token: entry.token,
      platform: entry.platform || "unknown",
      environment:
        entry.environment === "development" || entry.environment === "production"
          ? entry.environment
          : "unknown",
      deviceSessionId: entry.device_session_id,
      enabled: entry.enabled !== false,
      lastDeliveredAt: entry.last_delivered_at ? new Date(entry.last_delivered_at) : null,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
    }))

    const smsSource =
      session?.user?.id
        ? backendSmsAlerts.find((entry) => entry.user_id === session.user.id) ?? null
        : null

    const smsAlerts: SmsAlertPreferences | null = smsSource
      ? {
          phone: smsSource.phone,
          status: smsSource.status,
          allowCheckIns: smsSource.allow_checkins,
          allowSOS: smsSource.allow_sos,
          verificationExpiresAt: smsSource.verification_expires_at
            ? new Date(smsSource.verification_expires_at)
            : null,
          lastDispatchedAt: smsSource.last_dispatched_at ? new Date(smsSource.last_dispatched_at) : null,
        }
      : null

    setState((prev) => ({
      ...prev,
      waypoints: uiWaypoints,
      memberLocations: uiMemberLocations,
      groups: uiGroups,
      geofences: uiGeofences,
      groupInvitations: uiInvitations,
      groupActivity: uiActivity,
      deviceSessions: deviceSessionViews,
      currentDevice,
      pushSubscriptions,
      smsAlerts,
    }))
  }, [
    backendWaypoints,
    backendGroups,
    backendGeofences,
    backendProfiles,
    backendGroupInvitations,
    backendGroupActivity,
    backendDeviceSessions,
    backendPushSubscriptions,
    backendSmsAlerts,
    backendPrivacySettings,
    deviceSessionId,
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
      isSyncing: status === "sending" || status === "pulling",
      lastSyncedAt,
      billingOfferings,
      billingLoading,
      billingError,
      billingReceipt,
      deviceSessionId,
      addEmergencyContact,
      updateEmergencyContact,
      deleteEmergencyContact,
      sendTestContactNotification,
      updatePrivacySettings,
      registerPushSubscription,
      togglePushSubscription: togglePushSubscriptionSetting,
      beginSmsOptIn,
      verifySmsCode,
      updateSmsPreferences,
      signUp,
      signIn,
      signOut,
      refresh,
      refreshDeviceSessions,
      revokeDeviceSession,
      purchasePremium,
      restorePremium,
      startTrip,
      endTrip,
      deleteTrip,
      updateTrip,
      checkIn,
      addWaypoint,
      deleteWaypoint,
      createGroup,
      updateGroup,
      createGeofence,
      updateGeofence,
      deleteGeofence,
      inviteToGroup,
      resendGroupInvitation,
      withdrawGroupInvitation,
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
      addEmergencyContact,
      addWaypoint,
      billingError,
      billingLoading,
      billingOfferings,
      billingReceipt,
      cancelSOS,
      checkIn,
      createGeofence,
      createGroup,
      updateGroup,
      deleteGeofence,
      deleteEmergencyContact,
      deleteTrip,
      deleteWaypoint,
      deviceSessionId,
      endTrip,
      inviteToGroup,
      joinGroup,
      lastSyncedAt,
      leaveGroup,
      pending,
      profile,
      purchasePremium,
      refresh,
      refreshDeviceSessions,
      respondToInvitation,
      resendGroupInvitation,
      restorePremium,
      resolveSOS,
      revokeDeviceSession,
      beginSmsOptIn,
      sendTestContactNotification,
      session,
      registerPushSubscription,
      signIn,
      signOut,
      signUp,
      togglePushSubscriptionSetting,
      startTrip,
      state,
      status,
      updateSmsPreferences,
      toggleGeofenceAlerts,
      triggerSOS,
      verifySmsCode,
      updatePrivacySettings,
      updateEmergencyContact,
      updateGeofence,
      updateGeofenceAlerts,
      withdrawGroupInvitation,
      updateTrip,
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
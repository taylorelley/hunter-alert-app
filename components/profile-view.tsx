"use client"

import { useEffect, useState } from "react"
import {
  User,
  Bell,
  Phone,
  Eye,
  EyeOff,
  ChevronRight,
  LogOut,
  HelpCircle,
  FileText,
  Smartphone,
  RefreshCw,
  Loader2,
  ShieldX,
  MapPin,
  Users,
  Radio,
  Star,
  Settings,
  Plus,
  Trash2,
  Mail,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { EmergencyContact, PrivacySettings, SmsAlertPreferences, useApp } from "./app-provider"
import { useNetwork } from "./network-provider"
import { AdminDebugPanel } from "./admin-debug-panel"
import { BillingSettings } from "./billing-settings"
import { EmergencyContactModal } from "./modals/emergency-contact-modal"
import { DeleteContactModal } from "./modals/delete-contact-modal"
import { TestNotificationModal } from "./modals/test-notification-modal"

export function ProfileView() {
  const {
    userName,
    isPremium,
    emergencyContacts,
    deviceSessions,
    currentDevice,
    deviceSessionId,
    pushSubscriptions,
    smsAlerts,
    signIn,
    signOut,
    session,
    refreshDeviceSessions,
    revokeDeviceSession,
    addEmergencyContact,
    updateEmergencyContact,
    deleteEmergencyContact,
    sendTestContactNotification,
    privacySettings,
    updatePrivacySettings,
    registerPushSubscription,
    togglePushSubscription,
    beginSmsOptIn,
    verifySmsCode,
    updateSmsPreferences,
  } = useApp()
  const { state: network } = useNetwork()
  const [privacyError, setPrivacyError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [refreshingDevices, setRefreshingDevices] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null)
  const [contactDeletion, setContactDeletion] = useState<EmergencyContact | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [pushStatus, setPushStatus] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushLoading, setPushLoading] = useState(false)
  const [smsPhone, setSmsPhone] = useState("")
  const [smsCode, setSmsCode] = useState("")
  const [smsStatusMessage, setSmsStatusMessage] = useState<string | null>(null)
  const [smsError, setSmsError] = useState<string | null>(null)
  const [smsLoading, setSmsLoading] = useState(false)
  const [smsPhoneEdited, setSmsPhoneEdited] = useState(false)
  const showAdminDebug = process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG === "true"

  const normalizePhone = (phone: string) => phone.replace(/[\s\-()]/g, "")

  const isValidPhone = (phone: string) => {
    const normalized = normalizePhone(phone)
    return /^\+[1-9]\d{6,14}$/.test(normalized)
  }

  useEffect(() => {
    if (smsAlerts?.phone && !smsPhoneEdited) {
      setSmsPhone(smsAlerts.phone)
    }
  }, [smsAlerts?.phone, smsPhoneEdited])

  const handleSignIn = async () => {
    setAuthError(null)
    setAuthLoading(true)
    try {
      await signIn(email, password)
      setEmail("")
      setPassword("")
    } catch (err) {
      console.error(err)
      setAuthError("Unable to sign in. Check your credentials and network state.")
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRefreshDevices = async () => {
    setDeviceError(null)
    if (!session) return
    setRefreshingDevices(true)
    try {
      await refreshDeviceSessions()
    } catch (error) {
      console.error(error)
      setDeviceError("Unable to refresh devices. Check your connection.")
    } finally {
      setRefreshingDevices(false)
    }
  }

  const handleRevokeDevice = async (id: string) => {
    setDeviceError(null)
    setRevokingId(id)
    try {
      await revokeDeviceSession(id)
    } catch (error) {
      console.error(error)
      setDeviceError("Unable to revoke the selected session. Try again when online.")
    } finally {
      setRevokingId(null)
    }
  }

  const handleSaveContact = async (contact: Omit<EmergencyContact, "id">) => {
    setContactError(null)
    try {
      if (editingContact) {
        await updateEmergencyContact(editingContact.id, contact)
      } else {
        await addEmergencyContact(contact)
      }
      setEditingContact(null)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Unable to save contact right now"
      setContactError(message)
    }
  }

  const handleDeleteContact = async () => {
    if (!contactDeletion) return
    setDeleteError(null)
    setContactError(null)
    try {
      await deleteEmergencyContact(contactDeletion.id)
      setContactDeletion(null)
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Unable to delete contact. Try again when online."
      setDeleteError(message)
      setContactError(message)
    }
  }

  const handleSendTestNotification = async (options: { contactId: string; channel?: "sms" | "email" }) => {
    setContactError(null)
    try {
      await sendTestContactNotification(options)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send a test message right now"
      setContactError(message)
      throw error instanceof Error ? error : new Error(message)
    }
  }

  const handlePrivacyToggle = async (changes: Partial<PrivacySettings>) => {
    setPrivacyError(null)
    try {
      await updatePrivacySettings(changes)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save privacy preference"
      setPrivacyError(message)
    }
  }

  const handleRegisterPush = async () => {
    setPushError(null)
    setPushStatus(null)
    if (network.connectivity === "offline") {
      setPushError("Connect to the network to register this device for push alerts")
      return
    }
    setPushLoading(true)
    try {
      await registerPushSubscription()
      setPushStatus("Device registered for push alerts")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register for push notifications"
      setPushError(message)
    } finally {
      setPushLoading(false)
    }
  }

  const handleTogglePush = async (id: string, enabled: boolean) => {
    setPushError(null)
    try {
      await togglePushSubscription(id, enabled)
      setPushStatus(enabled ? "Push alerts enabled" : "Push alerts disabled")
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update push alerts"
      setPushError(message)
    }
  }

  const handleBeginSms = async () => {
    setSmsError(null)
    setSmsStatusMessage(null)
    if (network.connectivity === "offline") {
      setSmsError("Connect to the network to start SMS verification")
      return
    }
    setSmsLoading(true)
    try {
      const normalizedPhone = normalizePhone(smsPhone)
      await beginSmsOptIn({
        phone: normalizedPhone,
        allowCheckIns: smsAlerts?.allowCheckIns ?? true,
        allowSOS: smsAlerts?.allowSOS ?? true,
      })
      setSmsStatusMessage("Verification code sent. Enter the code to finish enabling SMS alerts.")
      setSmsCode("")
      setSmsPhoneEdited(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to start SMS verification"
      setSmsError(message)
    } finally {
      setSmsLoading(false)
    }
  }

  const handleVerifySms = async () => {
    setSmsError(null)
    setSmsStatusMessage(null)
    if (network.connectivity === "offline") {
      setSmsError("Connect to the network to verify SMS alerts")
      return
    }
    setSmsLoading(true)
    try {
      await verifySmsCode(smsCode)
      setSmsStatusMessage("SMS alerts verified")
      setSmsPhoneEdited(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed"
      setSmsError(message)
    } finally {
      setSmsLoading(false)
    }
  }

  const handleSmsPreferenceChange = async (changes: Partial<{ allowCheckIns: boolean; allowSOS: boolean; status: string }>) => {
    setSmsError(null)
    if (network.connectivity === "offline") {
      setSmsError("Connect to the network to update SMS alert preferences")
      return
    }
    if (!smsAlerts) {
      setSmsError("Start verification first to manage SMS alerts")
      return
    }
    const validStatuses = ["pending", "verified", "disabled"] as const
    const status = validStatuses.includes(changes.status as (typeof validStatuses)[number])
      ? (changes.status as SmsAlertPreferences["status"])
      : undefined
    try {
      await updateSmsPreferences({
        allowCheckIns: changes.allowCheckIns,
        allowSOS: changes.allowSOS,
        status,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update SMS alert preferences"
      setSmsError(message)
    }
  }

  const otherSessions = deviceSessions.filter((deviceSession) => !deviceSession.isCurrent)

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-6 space-y-6">
        {/* Profile Header */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-10 h-10 text-primary" />
            </div>
            {network.connectivity !== "offline" && (
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-safe border-2 border-background" />
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{userName}</h1>
            <p className="text-sm text-muted-foreground">Anonymous identifier for map presence</p>
            {isPremium ? (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full bg-accent/20 text-accent text-xs font-medium">
                <Star className="w-3 h-3" />
                Pro Member
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
                Free Plan
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} disabled={!session}>
            <Settings className="w-5 h-5" />
          </Button>
        </div>

        {!session && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold">Sign in</p>
                  <p className="text-sm text-muted-foreground">Use your Supabase credentials to sync trips and messages.</p>
                </div>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="w-full p-3 rounded-lg bg-input border border-border text-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full p-3 rounded-lg bg-input border border-border text-sm"
              />
              {authError && <p className="text-sm text-danger">{authError}</p>}
              <Button onClick={handleSignIn} disabled={authLoading || !email || !password} className="w-full">
                {authLoading ? "Signing in..." : "Sign in"}
              </Button>
            </CardContent>
          </Card>
        )}

        <BillingSettings title="Billing & Purchases" />

        {/* Emergency Contacts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Emergency Contacts</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary"
              onClick={() => {
                setEditingContact(null)
                setContactModalOpen(true)
                setContactError(null)
              }}
            >
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
          {contactError && (
            <div className="flex items-center gap-2 text-sm text-danger">
              <AlertCircle className="w-4 h-4" /> {contactError}
            </div>
          )}
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {emergencyContacts.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No emergency contacts yet. Add someone we should notify during check-ins or SOS alerts.
                </div>
              ) : (
                emergencyContacts.map((contact) => (
                  <div key={contact.id} className="flex items-start justify-between p-4 gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-safe/20 flex items-center justify-center mt-0.5">
                        <Phone className="w-5 h-5 text-safe" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium leading-tight">{contact.name}</p>
                        {contact.phone && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Phone className="w-4 h-4" /> {contact.phone}
                          </p>
                        )}
                        {contact.email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Mail className="w-4 h-4" /> {contact.email}
                          </p>
                        )}
                        {contact.relationship && (
                          <p className="text-xs text-muted-foreground">Relationship: {contact.relationship}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingContact(contact)
                          setContactModalOpen(true)
                          setContactError(null)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => {
                          setContactDeletion(contact)
                          setDeleteError(null)
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
              <div className="p-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-transparent"
                  disabled={emergencyContacts.length === 0 || !session}
                  onClick={() => setTestModalOpen(true)}
                >
                  Send Test Notification
                </Button>
                {emergencyContacts.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-2">Add at least one contact to test alerts.</p>
                )}
                {!session && <p className="text-xs text-muted-foreground mt-1">Sign in to trigger a server-side test.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Privacy & Sharing */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Privacy & Sharing</h2>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Live Location</p>
                    <p className="text-xs text-muted-foreground">Share with contacts during trips</p>
                  </div>
                </div>
                <Switch
                  checked={privacySettings.shareLocation}
                  onCheckedChange={(value) => handlePrivacyToggle({ shareLocation: value })}
                />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Trip Visibility</p>
                    <p className="text-xs text-muted-foreground">Let group members see your trips</p>
                  </div>
                </div>
                <Switch
                  checked={privacySettings.shareTrips}
                  onCheckedChange={(value) => handlePrivacyToggle({ shareTrips: value })}
                />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Waypoint Sharing</p>
                    <p className="text-xs text-muted-foreground">Share waypoints with groups</p>
                  </div>
                </div>
                <Switch
                  checked={privacySettings.shareWaypoints}
                  onCheckedChange={(value) => handlePrivacyToggle({ shareWaypoints: value })}
                />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Anonymous on Map</p>
                    <p className="text-xs text-muted-foreground">Hide your identity on shared maps</p>
                  </div>
                </div>
                <Switch
                  // Invert the toggle so "Anonymous" maps to showOnMap = false
                  checked={!privacySettings.showOnMap}
                  onCheckedChange={(value) => handlePrivacyToggle({ showOnMap: !value })}
                />
              </div>
            </CardContent>
            {privacyError && <p className="text-sm text-danger px-4 pb-4">{privacyError}</p>}
          </Card>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notifications</h2>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Push notifications</p>
                    <p className="text-xs text-muted-foreground">
                      Register this device to receive check-in and SOS alerts.
                    </p>
                  </div>
                </div>
                <Button onClick={handleRegisterPush} disabled={!session || pushLoading} size="sm">
                  {pushLoading ? "Registering..." : "Register"}
                </Button>
              </div>
              {pushError && <p className="text-sm text-danger">{pushError}</p>}
              {pushStatus && <p className="text-sm text-safe">{pushStatus}</p>}
              <div className="space-y-2">
                {pushSubscriptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No push tokens registered yet. Run from a native build to activate push alerts.
                  </p>
                )}
                {pushSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{subscription.platform} • {subscription.environment}</p>
                      <p className="text-xs text-muted-foreground">
                        {subscription.deviceSessionId ? `Session ${subscription.deviceSessionId}` : "No session"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Updated {subscription.updatedAt.toLocaleString()}
                      </p>
                    </div>
                    <Switch
                      checked={subscription.enabled}
                      onCheckedChange={(value) => handleTogglePush(subscription.id, value)}
                      disabled={!session}
                      aria-label={subscription.enabled ? "Disable push alerts" : "Enable push alerts"}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <Radio className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium">SMS alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Receive SMS for check-ins and SOS when data is limited.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <input
                  type="tel"
                  value={smsPhone}
                  onChange={(e) => {
                    setSmsPhoneEdited(true)
                    setSmsPhone(e.target.value)
                  }}
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm"
                  placeholder="+1 (555) 555-1234"
                  disabled={!session || smsLoading}
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <Button
                    onClick={handleBeginSms}
                    disabled={!session || !smsPhone || !isValidPhone(smsPhone) || smsLoading}
                    size="sm"
                  >
                    {smsLoading ? "Sending..." : smsAlerts?.status === "pending" ? "Resend code" : "Verify number"}
                  </Button>
                  {smsAlerts?.status === "pending" && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={smsCode}
                        onChange={(e) => setSmsCode(e.target.value)}
                        className="w-28 p-2 rounded-lg bg-input border border-border text-sm"
                        placeholder="Code"
                        disabled={smsLoading}
                      />
                      <Button onClick={handleVerifySms} disabled={!smsCode || smsLoading} size="sm" variant="secondary">
                        Verify
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={smsAlerts?.allowCheckIns ?? true}
                    onCheckedChange={(value) => handleSmsPreferenceChange({ allowCheckIns: value })}
                    disabled={!session || smsAlerts?.status === "pending"}
                  />
                  Check-in texts
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={smsAlerts?.allowSOS ?? true}
                    onCheckedChange={(value) => handleSmsPreferenceChange({ allowSOS: value })}
                    disabled={!session || smsAlerts?.status === "pending"}
                  />
                  SOS texts
                </label>
              </div>
              {smsAlerts?.status && (
                <p className="text-xs text-muted-foreground">
                  Status: {smsAlerts.status === "verified" ? "Verified" : smsAlerts.status === "pending" ? "Awaiting code" : "Disabled"}
                  {smsAlerts.lastDispatchedAt && ` • Last sent ${smsAlerts.lastDispatchedAt.toLocaleString()}`}
                </p>
              )}
              {smsStatusMessage && <p className="text-sm text-safe">{smsStatusMessage}</p>}
              {smsError && <p className="text-sm text-danger">{smsError}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Device & Sessions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Devices</h2>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleRefreshDevices}
                disabled={!session || refreshingDevices}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshingDevices ? "animate-spin" : ""}`} />
                {refreshingDevices ? "Refreshing" : "Refresh"}
              </Button>
            </div>
          </div>
          {deviceError && <p className="text-sm text-danger">{deviceError}</p>}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">This Device</p>
                    <p className="text-xs text-muted-foreground">
                      {currentDevice?.label || "Unknown device"}
                      {currentDevice?.platform ? ` • ${currentDevice.platform}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last active {currentDevice?.lastSeen ? currentDevice.lastSeen.toLocaleString() : "n/a"}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    currentDevice?.revokedAt
                      ? "bg-danger/20 text-danger"
                      : network.connectivity === "offline"
                        ? "bg-muted text-muted-foreground"
                        : "bg-safe/20 text-safe"
                  }`}
                >
                  {currentDevice?.revokedAt ? "Revoked" : "Active"}
                </span>
              </div>
              {deviceSessionId && (
                <p className="text-[11px] text-muted-foreground">Device ID: {deviceSessionId}</p>
              )}
            </CardContent>
            {otherSessions.length > 0 && (
              <div className="border-t border-border divide-y divide-border">
                {otherSessions.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-muted-foreground" />
                        <p className="font-medium">{device.label}</p>
                        {device.revokedAt && (
                          <span className="px-2 py-0.5 rounded-full bg-danger/10 text-danger text-[11px]">Revoked</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {device.platform} • Last seen {device.lastSeen.toLocaleString()}
                      </p>
                      {device.appVersion && (
                        <p className="text-xs text-muted-foreground">App {device.appVersion}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        onClick={() => handleRevokeDevice(device.id)}
                        disabled={!!device.revokedAt || revokingId === device.id || !session}
                      >
                        {revokingId === device.id ? (
                          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        ) : (
                          <ShieldX className="w-4 h-4 mr-1" />
                        )}
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {otherSessions.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 pb-4">
                Recent sessions will appear here. Cached results remain visible when offline.
              </p>
            )}
          </Card>
        </div>

        {/* Help & Support */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Support</h2>
          <Card>
            <CardContent className="p-0">
              <button className="flex items-center justify-between p-4 w-full hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <HelpCircle className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Help Center</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button className="flex items-center justify-between p-4 w-full hover:bg-muted/50 transition-colors border-t border-border">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">User Guide</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>

        <EmergencyContactModal
          isOpen={contactModalOpen}
          onClose={() => {
            setContactModalOpen(false)
            setEditingContact(null)
          }}
          onSubmit={handleSaveContact}
          initialContact={editingContact}
        />

        <DeleteContactModal
          isOpen={Boolean(contactDeletion)}
          onClose={() => {
            setContactDeletion(null)
            setDeleteError(null)
          }}
          onConfirm={handleDeleteContact}
          contactName={contactDeletion?.name ?? ""}
          contactDetails={[contactDeletion?.phone, contactDeletion?.email].filter(Boolean).join(" • ")}
          errorMessage={deleteError}
        />

        <TestNotificationModal
          isOpen={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          contacts={emergencyContacts}
          onSend={handleSendTestNotification}
        />

        {/* Admin Debug */}
        {showAdminDebug && <AdminDebugPanel />}

        {/* Sign Out */}
        <Button
          variant="outline"
          className="w-full text-danger border-danger/30 hover:bg-danger/10 hover:text-danger bg-transparent"
          onClick={signOut}
          disabled={!session}
        >
          <LogOut className="w-4 h-4 mr-2" />
          {session ? "Sign Out" : "Sign in required"}
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground">
          Hunter Alert v1.0.0 • Made with care for your safety
        </p>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
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
  MapPin,
  Users,
  Radio,
  Zap,
  Star,
  Settings,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { useApp } from "./app-provider"
import { useNetwork } from "./network-provider"
import { AdminDebugPanel } from "./admin-debug-panel"

export function ProfileView() {
  const { userName, isPremium, emergencyContacts, signIn, signOut, session } = useApp()
  const { state: network } = useNetwork()
  const [locationSharing, setLocationSharing] = useState(true)
  const [tripVisibility, setTripVisibility] = useState(true)
  const [waypointSharing, setWaypointSharing] = useState(true)
  const [anonymousMode, setAnonymousMode] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const showAdminDebug = process.env.NEXT_PUBLIC_ENABLE_ADMIN_DEBUG === "true"

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

        {/* Premium Upgrade */}
        {!isPremium && (
          <Card className="border-accent/30 bg-gradient-to-br from-accent/10 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-accent/20">
                  <Zap className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Upgrade to Pro</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    High-frequency check-ins, advanced waypoints, extended history, and priority support.
                  </p>
                  <div className="flex items-center gap-4 mt-3">
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90">$4.99/month</Button>
                    <span className="text-xs text-muted-foreground">or $39.99/year</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Emergency Contacts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Emergency Contacts</h2>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary">
              + Add
            </Button>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {emergencyContacts.map((contact, index) => (
                <div key={index} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-safe/20 flex items-center justify-center">
                      <Phone className="w-5 h-5 text-safe" />
                    </div>
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">{contact.phone}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Edit
                  </Button>
                </div>
              ))}
              <div className="p-4">
                <Button variant="outline" size="sm" className="w-full bg-transparent">
                  Send Test Notification
                </Button>
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
                <Switch checked={locationSharing} onCheckedChange={setLocationSharing} />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Trip Visibility</p>
                    <p className="text-xs text-muted-foreground">Let group members see your trips</p>
                  </div>
                </div>
                <Switch checked={tripVisibility} onCheckedChange={setTripVisibility} />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Waypoint Sharing</p>
                    <p className="text-xs text-muted-foreground">Share waypoints with groups</p>
                  </div>
                </div>
                <Switch checked={waypointSharing} onCheckedChange={setWaypointSharing} />
              </div>

              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <EyeOff className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Anonymous on Map</p>
                    <p className="text-xs text-muted-foreground">Show identifier instead of name</p>
                  </div>
                </div>
                <Switch checked={anonymousMode} onCheckedChange={setAnonymousMode} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Notifications */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notifications</h2>
          <Card>
            <CardContent className="p-0">
              <button className="flex items-center justify-between p-4 w-full hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Push Notifications</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              <button className="flex items-center justify-between p-4 w-full hover:bg-muted/50 transition-colors border-t border-border">
                <div className="flex items-center gap-3">
                  <Radio className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">SMS Alerts</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Device & Sessions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Devices</h2>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">This Device</p>
                    <p className="text-xs text-muted-foreground">iPhone 15 Pro • Last active now</p>
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full bg-safe/20 text-safe text-xs font-medium">Active</span>
              </div>
            </CardContent>
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

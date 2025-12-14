"use client"

import { useState, type JSX } from "react"
import { AppProvider, type Trip } from "@/components/app-provider"
import { NetworkProvider } from "@/components/network-provider"
import { MobileNav } from "@/components/mobile-nav"
import { StatusHeader } from "@/components/status-header"
import { HomeView } from "@/components/home-view"
import { MapView } from "@/components/map-view"
import { TripsView } from "@/components/trips-view"
import { GroupsView } from "@/components/groups-view"
import { ProfileView } from "@/components/profile-view"
import { CheckInModal } from "@/components/modals/check-in-modal"
import { SOSModal } from "@/components/modals/sos-modal"
import { AddWaypointModal } from "@/components/modals/add-waypoint-modal"
import { PlanTripModal } from "@/components/modals/plan-trip-modal"
import { AuthView } from "@/components/auth-view"
import { useApp } from "@/components/app-provider"

function HunterAlertApp(): JSX.Element {
  const [activeTab, setActiveTab] = useState("home")
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showSOS, setShowSOS] = useState(false)
  const [showAddWaypoint, setShowAddWaypoint] = useState(false)
  const [showPlanTrip, setShowPlanTrip] = useState(false)
  const [tripToEdit, setTripToEdit] = useState<Trip | null>(null)

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <StatusHeader onOpenAccount={() => setActiveTab("profile")} isAccountActive={activeTab === "profile"} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "home" && (
          <HomeView
            onNavigate={setActiveTab}
            onCheckIn={() => setShowCheckIn(true)}
            onAddWaypoint={() => setShowAddWaypoint(true)}
            onStartTrip={() => {
              setTripToEdit(null)
              setShowPlanTrip(true)
            }}
          />
        )}
        {activeTab === "map" && <MapView onAddWaypoint={() => setShowAddWaypoint(true)} />}
        {activeTab === "trips" && (
          <TripsView
            onStartTrip={() => {
              setTripToEdit(null)
              setShowPlanTrip(true)
            }}
            onEditTrip={(trip) => {
              setTripToEdit(trip)
              setShowPlanTrip(true)
            }}
          />
        )}
        {activeTab === "groups" && <GroupsView />}
        {activeTab === "profile" && <ProfileView />}
      </main>

      <MobileNav activeTab={activeTab} onTabChange={setActiveTab} onSOSPress={() => setShowSOS(true)} />

      {/* Modals */}
      <CheckInModal isOpen={showCheckIn} onClose={() => setShowCheckIn(false)} />
      <SOSModal isOpen={showSOS} onClose={() => setShowSOS(false)} />
      <AddWaypointModal isOpen={showAddWaypoint} onClose={() => setShowAddWaypoint(false)} />
      <PlanTripModal
        isOpen={showPlanTrip}
        trip={tripToEdit}
        onClose={() => {
          setShowPlanTrip(false)
          setTripToEdit(null)
        }}
      />
    </div>
  )
}

function AppContent(): JSX.Element {
  const { session } = useApp()

  if (!session) {
    return <AuthView />
  }

  return <HunterAlertApp />
}

export default function Page(): JSX.Element {
  return (
    <NetworkProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </NetworkProvider>
  )
}

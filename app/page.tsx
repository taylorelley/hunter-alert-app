"use client"

import { useState } from "react"
import { AppProvider } from "@/components/app-provider"
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

function HunterAlertApp() {
  const [activeTab, setActiveTab] = useState("home")
  const [showCheckIn, setShowCheckIn] = useState(false)
  const [showSOS, setShowSOS] = useState(false)
  const [showAddWaypoint, setShowAddWaypoint] = useState(false)
  const [showPlanTrip, setShowPlanTrip] = useState(false)

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <StatusHeader />

      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "home" && (
          <HomeView
            onNavigate={setActiveTab}
            onCheckIn={() => setShowCheckIn(true)}
            onAddWaypoint={() => setShowAddWaypoint(true)}
            onStartTrip={() => setShowPlanTrip(true)}
          />
        )}
        {activeTab === "map" && <MapView onAddWaypoint={() => setShowAddWaypoint(true)} />}
        {activeTab === "trips" && <TripsView onStartTrip={() => setShowPlanTrip(true)} />}
        {activeTab === "groups" && <GroupsView />}
        {activeTab === "profile" && <ProfileView />}
      </main>

      <MobileNav activeTab={activeTab} onTabChange={setActiveTab} onSOSPress={() => setShowSOS(true)} />

      {/* Modals */}
      <CheckInModal isOpen={showCheckIn} onClose={() => setShowCheckIn(false)} />
      <SOSModal isOpen={showSOS} onClose={() => setShowSOS(false)} />
      <AddWaypointModal isOpen={showAddWaypoint} onClose={() => setShowAddWaypoint(false)} />
      <PlanTripModal isOpen={showPlanTrip} onClose={() => setShowPlanTrip(false)} />
    </div>
  )
}

export default function Page() {
  return (
    <NetworkProvider>
      <AppProvider>
        <HunterAlertApp />
      </AppProvider>
    </NetworkProvider>
  )
}

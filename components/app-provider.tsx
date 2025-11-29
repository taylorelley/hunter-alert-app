"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

type TripStatus = "none" | "planning" | "active" | "paused" | "completed"
type CheckInStatus = "ok" | "pending" | "overdue"

interface Trip {
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

interface CheckIn {
  id: string
  timestamp: Date
  status: "ok" | "need-help"
  notes: string
  batteryLevel: number
  signalStrength: number
}

interface Waypoint {
  id: string
  name: string
  type: "camp" | "vehicle" | "hazard" | "custom" | "water" | "viewpoint"
  coordinates: { lat: number; lng: number }
  notes: string
  isPrivate: boolean
  createdAt: Date
}

interface Group {
  id: string
  name: string
  description: string
  members: { id: string; name: string; role: "owner" | "admin" | "member" }[]
  waypoints: Waypoint[]
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
  setOnlineStatus: (status: boolean) => void
  startTrip: (trip: Omit<Trip, "id" | "checkIns" | "status">) => void
  endTrip: () => void
  checkIn: (status: "ok" | "need-help", notes: string) => void
  addWaypoint: (waypoint: Omit<Waypoint, "id" | "createdAt">) => void
  triggerSOS: (silent: boolean) => void
  cancelSOS: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    isOnline: true,
    isPremium: false,
    currentTrip: {
      id: "1",
      destination: "Black Hills National Forest",
      startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      checkInCadence: 4,
      emergencyContacts: ["John Doe", "Jane Smith"],
      notes: "Deer hunting - eastern ridge",
      status: "active",
      checkIns: [
        {
          id: "1",
          timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
          status: "ok",
          notes: "Set up camp",
          batteryLevel: 85,
          signalStrength: 3,
        },
        {
          id: "2",
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
          status: "ok",
          notes: "Arrived at location",
          batteryLevel: 92,
          signalStrength: 4,
        },
      ],
    },
    trips: [],
    waypoints: [
      {
        id: "1",
        name: "Base Camp",
        type: "camp",
        coordinates: { lat: 43.8, lng: -103.5 },
        notes: "Near creek",
        isPrivate: false,
        createdAt: new Date(),
      },
      {
        id: "2",
        name: "Truck Parking",
        type: "vehicle",
        coordinates: { lat: 43.81, lng: -103.52 },
        notes: "Trailhead lot",
        isPrivate: false,
        createdAt: new Date(),
      },
      {
        id: "3",
        name: "Steep Drop-off",
        type: "hazard",
        coordinates: { lat: 43.79, lng: -103.48 },
        notes: "Hidden cliff edge",
        isPrivate: false,
        createdAt: new Date(),
      },
    ],
    groups: [
      {
        id: "1",
        name: "Weekend Warriors",
        description: "Local hunting group",
        members: [
          { id: "1", name: "Mike Johnson", role: "owner" },
          { id: "2", name: "Tom Wilson", role: "admin" },
          { id: "3", name: "Dave Brown", role: "member" },
        ],
        waypoints: [],
      },
    ],
    checkInStatus: "pending",
    nextCheckInDue: new Date(Date.now() + 45 * 60 * 1000),
    sosActive: false,
    userName: "Hunter_2847",
    emergencyContacts: [
      { name: "Sarah (Wife)", phone: "+1 555-0123" },
      { name: "Mike (Brother)", phone: "+1 555-0456" },
    ],
  })

  const setOnlineStatus = useCallback((status: boolean) => {
    setState((prev) => ({ ...prev, isOnline: status }))
  }, [])

  const startTrip = useCallback((trip: Omit<Trip, "id" | "checkIns" | "status">) => {
    const newTrip: Trip = {
      ...trip,
      id: Date.now().toString(),
      checkIns: [],
      status: "active",
    }
    setState((prev) => ({
      ...prev,
      currentTrip: newTrip,
      trips: [...prev.trips, newTrip],
      nextCheckInDue: new Date(Date.now() + trip.checkInCadence * 60 * 60 * 1000),
      checkInStatus: "ok",
    }))
  }, [])

  const endTrip = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentTrip: prev.currentTrip ? { ...prev.currentTrip, status: "completed" } : null,
      nextCheckInDue: null,
      checkInStatus: "ok",
    }))
  }, [])

  const checkIn = useCallback((status: "ok" | "need-help", notes: string) => {
    setState((prev) => {
      if (!prev.currentTrip) return prev
      const newCheckIn: CheckIn = {
        id: Date.now().toString(),
        timestamp: new Date(),
        status,
        notes,
        batteryLevel: Math.floor(Math.random() * 30) + 60,
        signalStrength: Math.floor(Math.random() * 3) + 2,
      }
      return {
        ...prev,
        currentTrip: {
          ...prev.currentTrip,
          checkIns: [newCheckIn, ...prev.currentTrip.checkIns],
        },
        checkInStatus: "ok",
        nextCheckInDue: new Date(Date.now() + prev.currentTrip.checkInCadence * 60 * 60 * 1000),
      }
    })
  }, [])

  const addWaypoint = useCallback((waypoint: Omit<Waypoint, "id" | "createdAt">) => {
    const newWaypoint: Waypoint = {
      ...waypoint,
      id: Date.now().toString(),
      createdAt: new Date(),
    }
    setState((prev) => ({
      ...prev,
      waypoints: [newWaypoint, ...prev.waypoints],
    }))
  }, [])

  const triggerSOS = useCallback((silent: boolean) => {
    setState((prev) => ({ ...prev, sosActive: true }))
    console.log(`SOS triggered (${silent ? "silent" : "full"})`)
  }, [])

  const cancelSOS = useCallback(() => {
    setState((prev) => ({ ...prev, sosActive: false }))
  }, [])

  return (
    <AppContext.Provider
      value={{
        ...state,
        setOnlineStatus,
        startTrip,
        endTrip,
        checkIn,
        addWaypoint,
        triggerSOS,
        cancelSOS,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error("useApp must be used within an AppProvider")
  }
  return context
}

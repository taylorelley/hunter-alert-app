"use client"

import { useState } from "react"
import {
  MapPin,
  Locate,
  Layers,
  Plus,
  Navigation,
  Tent,
  Car,
  AlertTriangle,
  Droplets,
  Eye,
  Users,
  ChevronUp,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "./app-provider"
import { cn } from "@/lib/utils"

interface MapViewProps {
  onAddWaypoint: () => void
}

export function MapView({ onAddWaypoint }: MapViewProps) {
  const { waypoints } = useApp()
  const [showLayers, setShowLayers] = useState(false)
  const [activeLayer, setActiveLayer] = useState<"terrain" | "satellite">("terrain")
  const [showNearbyHunters, setShowNearbyHunters] = useState(true)
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null)

  const nearbyHunters = [
    { id: "1", name: "Tom W.", distance: "0.8 mi", bearing: "NW", lastCheckIn: "15m ago" },
    { id: "2", name: "Dave B.", distance: "1.2 mi", bearing: "E", lastCheckIn: "32m ago" },
  ]

  const waypointIcons = {
    camp: Tent,
    vehicle: Car,
    hazard: AlertTriangle,
    water: Droplets,
    viewpoint: Eye,
    custom: MapPin,
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Map Background */}
      <div className="absolute inset-0 bg-[#1a2e1a]">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Simulated terrain features */}
        <div className="absolute top-1/4 left-1/3 w-32 h-32 rounded-full bg-[#2d4a2d] opacity-40 blur-2xl" />
        <div className="absolute top-1/2 right-1/4 w-48 h-24 rounded-full bg-[#1e3a1e] opacity-50 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 w-24 h-48 rounded-full bg-[#3d5a3d] opacity-30 blur-2xl" />

        {/* User location */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="relative">
            <div className="absolute -inset-4 bg-primary/20 rounded-full animate-ping" />
            <div className="absolute -inset-2 bg-primary/30 rounded-full" />
            <div className="w-4 h-4 bg-primary rounded-full border-2 border-primary-foreground shadow-lg" />
          </div>
        </div>

        {/* Waypoint markers */}
        {waypoints.map((waypoint, index) => {
          const Icon = waypointIcons[waypoint.type as keyof typeof waypointIcons] || MapPin
          const positions = [
            { top: "30%", left: "25%" },
            { top: "65%", left: "70%" },
            { top: "45%", left: "60%" },
          ]
          const pos = positions[index % positions.length]

          return (
            <button
              key={waypoint.id}
              className={cn(
                "absolute transform -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110",
                selectedWaypoint === waypoint.id && "scale-125",
              )}
              style={{ top: pos.top, left: pos.left }}
              onClick={() => setSelectedWaypoint(selectedWaypoint === waypoint.id ? null : waypoint.id)}
            >
              <div
                className={cn(
                  "p-2 rounded-full shadow-lg",
                  waypoint.type === "camp" && "bg-primary",
                  waypoint.type === "vehicle" && "bg-accent",
                  waypoint.type === "hazard" && "bg-danger",
                  waypoint.type === "water" && "bg-blue-500",
                  waypoint.type === "viewpoint" && "bg-purple-500",
                  waypoint.type === "custom" && "bg-muted-foreground",
                )}
              >
                <Icon className="w-4 h-4 text-white" />
              </div>
            </button>
          )
        })}

        {/* Nearby hunters */}
        {showNearbyHunters &&
          nearbyHunters.map((hunter, index) => {
            const positions = [
              { top: "35%", left: "40%" },
              { top: "55%", left: "75%" },
            ]
            const pos = positions[index % positions.length]

            return (
              <button
                key={hunter.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ top: pos.top, left: pos.left }}
              >
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-secondary border-2 border-safe flex items-center justify-center text-xs font-medium">
                    {hunter.name.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-safe border border-background" />
                </div>
              </button>
            )
          })}
      </div>

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="w-10 h-10 rounded-full shadow-lg"
          onClick={() => setShowLayers(!showLayers)}
        >
          <Layers className="w-5 h-5" />
        </Button>

        {showLayers && (
          <Card className="absolute top-12 right-0 w-40 shadow-xl">
            <CardContent className="p-2">
              <button
                onClick={() => setActiveLayer("terrain")}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left rounded-lg transition-colors",
                  activeLayer === "terrain" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                Terrain
              </button>
              <button
                onClick={() => setActiveLayer("satellite")}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left rounded-lg transition-colors",
                  activeLayer === "satellite" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                Satellite
              </button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="absolute top-4 left-4">
        <Button
          variant="secondary"
          size="icon"
          className="w-10 h-10 rounded-full shadow-lg"
          onClick={() => setShowNearbyHunters(!showNearbyHunters)}
        >
          <Users className={cn("w-5 h-5", showNearbyHunters && "text-primary")} />
        </Button>
      </div>

      {/* Recenter Button */}
      <div className="absolute bottom-32 right-4">
        <Button variant="secondary" size="icon" className="w-12 h-12 rounded-full shadow-lg">
          <Locate className="w-6 h-6" />
        </Button>
      </div>

      {/* Add Waypoint Button */}
      <div className="absolute bottom-32 left-4">
        <Button onClick={onAddWaypoint} className="h-12 px-4 rounded-full shadow-lg">
          <Plus className="w-5 h-5 mr-2" />
          Add Waypoint
        </Button>
      </div>

      {/* Compass */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2">
        <div className="w-12 h-12 rounded-full bg-card/90 backdrop-blur shadow-lg flex items-center justify-center">
          <Navigation className="w-5 h-5 text-danger transform -rotate-45" />
        </div>
      </div>

      {/* Selected Waypoint Detail */}
      {selectedWaypoint && (
        <div className="absolute bottom-24 left-4 right-4">
          <Card className="shadow-xl">
            <CardContent className="p-4">
              {(() => {
                const waypoint = waypoints.find((w) => w.id === selectedWaypoint)
                if (!waypoint) return null
                const Icon = waypointIcons[waypoint.type as keyof typeof waypointIcons] || MapPin

                return (
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        waypoint.type === "camp" && "bg-primary/20",
                        waypoint.type === "vehicle" && "bg-accent/20",
                        waypoint.type === "hazard" && "bg-danger/20",
                      )}
                    >
                      <Icon
                        className={cn(
                          "w-5 h-5",
                          waypoint.type === "camp" && "text-primary",
                          waypoint.type === "vehicle" && "text-accent",
                          waypoint.type === "hazard" && "text-danger",
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{waypoint.name}</h3>
                      <p className="text-sm text-muted-foreground">{waypoint.notes}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button size="sm" variant="outline">
                          <Navigation className="w-4 h-4 mr-1" />
                          Navigate
                        </Button>
                        <Button size="sm" variant="ghost">
                          Share
                        </Button>
                      </div>
                    </div>
                    <button onClick={() => setSelectedWaypoint(null)} className="p-1 hover:bg-muted rounded">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Nearby Hunters List */}
      {showNearbyHunters && (
        <div className="absolute top-16 left-4 right-4">
          <Card className="bg-card/95 backdrop-blur shadow-lg">
            <CardContent className="p-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Nearby Hunters ({nearbyHunters.length})
              </h3>
              <div className="space-y-2">
                {nearbyHunters.map((hunter) => (
                  <div key={hunter.id} className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                      {hunter.name.charAt(0)}
                    </div>
                    <span className="flex-1 font-medium">{hunter.name}</span>
                    <span className="text-muted-foreground">
                      {hunter.distance} {hunter.bearing}
                    </span>
                    <span className="text-xs text-safe">{hunter.lastCheckIn}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

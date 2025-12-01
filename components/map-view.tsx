"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import maplibregl, { Map as MaplibreMap, Marker, type RequestParameters } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
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
import { useApp, type Waypoint } from "./app-provider"
import { cn } from "@/lib/utils"
import { calculateDistance, clearWatch, watchPosition, type Coordinates } from "@/lib/geolocation"
import { useNetwork } from "./network-provider"

const WAYPOINT_ICONS: Record<Waypoint["type"], typeof MapPin> = {
  camp: Tent,
  vehicle: Car,
  hazard: AlertTriangle,
  water: Droplets,
  viewpoint: Eye,
  custom: MapPin,
}

const WAYPOINT_COLORS: Record<Waypoint["type"], string> = {
  camp: "#2563eb",
  vehicle: "#22c55e",
  hazard: "#ef4444",
  water: "#0ea5e9",
  viewpoint: "#a855f7",
  custom: "#6b7280",
}

const MAP_STYLES: Record<"terrain" | "satellite", string> = {
  terrain: "https://demotiles.maplibre.org/style.json",
  satellite: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
}

const TILE_CACHE_PROTOCOL = "cached+https"
const TILE_CACHE_NAME = "maplibre-tile-cache"
let tileProtocolRegistered = false

function registerTileCacheProtocol() {
  if (tileProtocolRegistered || typeof window === "undefined" || !("caches" in window)) return

  maplibregl.addProtocol(TILE_CACHE_PROTOCOL, async (params, controller) => {
    const url = params.url.replace(`${TILE_CACHE_PROTOCOL}://`, "https://")
    try {
      const cache = await caches.open(TILE_CACHE_NAME)

      const cached = await cache.match(url)
      if (cached) {
        const buffer = await cached.arrayBuffer()
        return {
          data: buffer,
          cacheControl: cached.headers.get("Cache-Control"),
          expires: cached.headers.get("Expires"),
        }
      }

      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Tile fetch failed: ${response.status}`)

      cache.put(url, response.clone())
      const buffer = await response.arrayBuffer()

      return {
        data: buffer,
        cacheControl: response.headers.get("Cache-Control"),
        expires: response.headers.get("Expires"),
      }
    } catch (error) {
      console.warn("Tile cache unavailable, falling back to direct fetch", error)

      const response = await fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`Tile fetch failed: ${response.status}`)

      const buffer = await response.arrayBuffer()

      return {
        data: buffer,
        cacheControl: response.headers.get("Cache-Control"),
        expires: response.headers.get("Expires"),
      }
    }
  })

  tileProtocolRegistered = true
}

function cacheableRequest(url: string, resourceType?: string): RequestParameters {
  if (url.startsWith("http")) {
    const protocolUrl = url.replace(/^https:\/\//, `${TILE_CACHE_PROTOCOL}://`)

    if (resourceType && ["Tile", "Glyphs", "SpriteImage", "SpriteJSON", "Image", "Style", "Source"].includes(resourceType)) {
      return { url: protocolUrl, cache: "force-cache" }
    }
  }

  return { url }
}

interface MapViewProps {
  onAddWaypoint: () => void
}

const DEFAULT_CENTER: [number, number] = [-103.5, 43.8]

export function MapView({ onAddWaypoint }: MapViewProps) {
  const { waypoints, memberLocations, syncStatus, lastSyncedAt } = useApp()
  const { state: network } = useNetwork()
  const [showLayers, setShowLayers] = useState(false)
  const [activeLayer, setActiveLayer] = useState<"terrain" | "satellite">("terrain")
  const [showNearbyHunters, setShowNearbyHunters] = useState(true)
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null)
  const hasAutoCenteredRef = useRef(false)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MaplibreMap | null>(null)
  const waypointMarkersRef = useRef<Marker[]>([])
  const memberMarkersRef = useRef<Marker[]>([])
  const userMarkerRef = useRef<Marker | null>(null)

  const formattedMembers = useMemo(
    () =>
      memberLocations.map((member) => {
        const distance = userLocation
          ? calculateDistance(
              userLocation.latitude,
              userLocation.longitude,
              member.coordinates.lat,
              member.coordinates.lng,
            )
          : null

        return {
          ...member,
          distanceLabel: distance != null ? `${(distance / 1609.34).toFixed(1)} mi` : "--",
        }
      }),
    [memberLocations, userLocation],
  )

  const refreshWaypointMarkers = useCallback(() => {
    if (!mapRef.current) return

    waypointMarkersRef.current.forEach((marker) => marker.remove())
    waypointMarkersRef.current = waypoints.map((waypoint) => {
      const marker = new maplibregl.Marker({ color: WAYPOINT_COLORS[waypoint.type] })
        .setLngLat([waypoint.coordinates.lng, waypoint.coordinates.lat])
        .addTo(mapRef.current as MaplibreMap)

      marker.getElement().classList.add("cursor-pointer")
      marker.getElement().addEventListener("click", () =>
        setSelectedWaypoint((current) => (current === waypoint.id ? null : waypoint.id)),
      )

      return marker
    })
  }, [waypoints])

  const refreshMemberMarkers = useCallback(() => {
    if (!mapRef.current) return

    memberMarkersRef.current.forEach((marker) => marker.remove())

    if (!showNearbyHunters) {
      memberMarkersRef.current = []
      return
    }

    memberMarkersRef.current = memberLocations.map((member) => {
      const marker = new maplibregl.Marker({ color: "#16a34a" })
        .setLngLat([member.coordinates.lng, member.coordinates.lat])
        .setPopup(new maplibregl.Popup({ closeButton: false }).setText(member.name))
        .addTo(mapRef.current as MaplibreMap)

      return marker
    })
  }, [memberLocations, showNearbyHunters])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    registerTileCacheProtocol()

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[activeLayer],
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
      transformRequest: (url, resourceType) => cacheableRequest(url, resourceType),
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), "top-right")
    map.once("load", () => {
      ;(map as unknown as { setMaxTileCacheSize?: (size?: number) => void }).setMaxTileCacheSize?.(256)
    })

    mapRef.current = map

    return () => {
      map.remove()
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setStyle(MAP_STYLES[activeLayer])
  }, [activeLayer])

  useEffect(() => {
    let cancelled = false
    let watchId: string | null = null

    watchPosition(
      (coords) => {
        if (cancelled) return
        setUserLocation(coords)

        if (!hasAutoCenteredRef.current && mapRef.current) {
          mapRef.current.easeTo({ center: [coords.longitude, coords.latitude], duration: 750 })
          hasAutoCenteredRef.current = true
        }
      },
      (error) => {
        console.error("Error watching position:", error)
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 }, // Extended timeout for constrained/satellite links
    )
      .then((id) => {
        if (!cancelled) {
          watchId = id
        }
      })
      .catch((error) => console.error("Failed to start geolocation watch", error))

    return () => {
      cancelled = true
      if (watchId) {
        clearWatch(watchId)
      }
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !userLocation) return

    userMarkerRef.current?.remove()

    const marker = new maplibregl.Marker({
      element: (() => {
        const el = document.createElement("div")
        el.className = "relative"
        el.innerHTML = `
          <span class="absolute -inset-3 rounded-full bg-primary/20 animate-ping"></span>
          <span class="absolute -inset-1.5 rounded-full bg-primary/30"></span>
          <span class="relative block w-4 h-4 rounded-full bg-primary border-2 border-white shadow-lg"></span>
        `
        return el
      })(),
    })
      .setLngLat([userLocation.longitude, userLocation.latitude])
      .addTo(mapRef.current)

    userMarkerRef.current = marker
  }, [userLocation])

  useEffect(() => {
    refreshWaypointMarkers()
  }, [refreshWaypointMarkers])

  useEffect(() => {
    refreshMemberMarkers()
  }, [refreshMemberMarkers])

  useEffect(() => {
    // Sync events may indicate fresh data without changing array identity; refresh to keep markers aligned.
    refreshWaypointMarkers()
    refreshMemberMarkers()
  }, [refreshMemberMarkers, refreshWaypointMarkers, syncStatus, network.lastUpdated, lastSyncedAt])

  const centerOnUser = useCallback(() => {
    hasAutoCenteredRef.current = false

    if (userLocation && mapRef.current) {
      mapRef.current.easeTo({ center: [userLocation.longitude, userLocation.latitude], duration: 500, zoom: 12 })
      hasAutoCenteredRef.current = true
    }
  }, [userLocation])

  const centerOnWaypoint = useCallback((wp: Waypoint) => {
    if (mapRef.current) {
      mapRef.current.easeTo({ center: [wp.coordinates.lng, wp.coordinates.lat], duration: 500, zoom: 14 })
    }
  }, [])

  return (
    <div className="flex-1 relative overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Map Controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <Button
          variant="secondary"
          size="icon"
          className="w-10 h-10 rounded-full shadow-lg"
          onClick={() => setShowLayers(!showLayers)}
        >
          <Layers className="w-5 h-5" />
        </Button>

        {showLayers && (
          <Card className="absolute top-12 right-0 w-44 shadow-xl">
            <CardContent className="p-2">
              <button
                onClick={() => setActiveLayer("terrain")}
                className={cn(
                  "w-full px-3 py-2 text-sm text-left rounded-lg transition-colors",
                  activeLayer === "terrain" ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                Terrain (cached)
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

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="w-10 h-10 rounded-full shadow-lg"
          onClick={() => setShowNearbyHunters(!showNearbyHunters)}
        >
          <Users className={cn("w-5 h-5", showNearbyHunters && "text-primary")} />
        </Button>
        <span className="text-xs bg-card/80 px-2 py-1 rounded-full shadow-sm">
          Sync: {syncStatus} {lastSyncedAt ? `· ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
        </span>
      </div>

      {/* Recenter Button */}
      <div className="absolute bottom-32 right-4 z-10">
        <Button variant="secondary" size="icon" className="w-12 h-12 rounded-full shadow-lg" onClick={centerOnUser}>
          <Locate className="w-6 h-6" />
        </Button>
      </div>

      {/* Add Waypoint Button */}
      <div className="absolute bottom-32 left-4 z-10">
        <Button onClick={onAddWaypoint} className="h-12 px-4 rounded-full shadow-lg">
          <Plus className="w-5 h-5 mr-2" />
          Add Waypoint
        </Button>
      </div>

      {/* Compass */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
        <div className="w-12 h-12 rounded-full bg-card/90 backdrop-blur shadow-lg flex items-center justify-center">
          <Navigation className="w-5 h-5 text-danger transform -rotate-45" />
        </div>
      </div>

      {/* Selected Waypoint Detail */}
      {selectedWaypoint && (
        <div className="absolute bottom-24 left-4 right-4 z-10">
          <Card className="shadow-xl">
            <CardContent className="p-4">
              {(() => {
                const waypoint = waypoints.find((w) => w.id === selectedWaypoint)
                if (!waypoint) return null
                const Icon = WAYPOINT_ICONS[waypoint.type] || MapPin

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
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => waypoint && centerOnWaypoint(waypoint)}
                        >
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
        <div className="absolute top-16 left-4 right-4 z-10">
          <Card className="bg-card/95 backdrop-blur shadow-lg">
            <CardContent className="p-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Nearby Hunters ({formattedMembers.length})
              </h3>
              <div className="space-y-2">
                {formattedMembers.map((hunter) => (
                  <div key={hunter.id} className="flex items-center gap-3 text-sm">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-medium">
                      {hunter.name.charAt(0)}
                    </div>
                    <span className="flex-1 font-medium truncate">{hunter.name}</span>
                    <span className="text-muted-foreground">{hunter.distanceLabel}</span>
                    <span className="text-xs text-safe">
                      {hunter.updatedAt ? new Date(hunter.updatedAt).toLocaleTimeString() : "Unknown"}
                    </span>
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

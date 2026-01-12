"use client"

import { useState, useEffect } from "react"
import {
  CheckCircle2,
  MapPin,
  Compass,
  AlertTriangle,
  Clock,
  Navigation,
  Sun,
  CloudRain,
  Wind,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  Droplets,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useApp } from "./app-provider"
import { BillingSettings } from "./billing-settings"
import { cn } from "@/lib/utils"
import { getCurrentPosition } from "@/lib/geolocation"
import { Badge } from "@/components/ui/badge"
import { useNetwork } from "@/components/network-provider"
import { Input } from "@/components/ui/input"
import {
  getCachedWeather,
  getWeatherByCoordinates,
  getWeatherByCity,
  type WeatherData,
  formatCondition,
} from "@/lib/weather"
import { parseTripDateMs } from "@/lib/date-utils"
import type { TabId } from "./mobile-nav"

interface HomeViewProps {
  onNavigate: (tab: TabId) => void
  onCheckIn: () => void
  onAddWaypoint: () => void
  onStartTrip: () => void
  onSOS: () => void
}

export function HomeView({ onNavigate, onCheckIn, onAddWaypoint, onStartTrip, onSOS }: HomeViewProps) {
  const { currentTrip, nextCheckInDue, checkInStatus, isPremium, waypoints } = useApp()
  const { state: networkState } = useNetwork()
  const { connectivity, constrained } = networkState
  const [timeRemaining, setTimeRemaining] = useState("")
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherRefreshing, setWeatherRefreshing] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [manualLocation, setManualLocation] = useState("")
  const [usingCachedWeather, setUsingCachedWeather] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [locationAvailable, setLocationAvailable] = useState(false)
  const [showManualLocation, setShowManualLocation] = useState(false)
  const isOffline = connectivity === "offline"

  useEffect(() => {
    if (!nextCheckInDue) return

    const updateTimer = () => {
      const now = new Date()
      const diff = nextCheckInDue.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining("Now")
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (hours > 0) {
        setTimeRemaining(`${hours}h ${minutes}m`)
      } else {
        setTimeRemaining(`${minutes}m`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [nextCheckInDue])

  // Fetch location and weather on mount and network changes
  useEffect(() => {
    let mounted = true
    const fetchLocationAndWeather = async () => {
      let locationResolved = false
      let cached: WeatherData | null = null
      try {
        cached = await getCachedWeather()
        if (mounted && cached) {
          setWeather(cached)
          setLastUpdated(new Date(cached.fetchedAt))
          setUsingCachedWeather(true)
          setWeatherLoading(false)
        }
      } catch (error) {
        console.error("Unable to load cached weather:", error)
        if (mounted) {
          setWeatherLoading(false)
        }
      }

      try {
        setLocationError(null)

        if (connectivity === "offline") {
          if (mounted && !cached) {
            setWeatherLoading(false)
          }
          return
        }

        if (mounted && !cached) {
          setWeatherLoading(true)
        }
        setWeatherRefreshing(true)
        const coords = await getCurrentPosition()
        if (!mounted) return
        locationResolved = true
        setLocationAvailable(true)
        setShowManualLocation(false)

        const weatherData = await getWeatherByCoordinates(coords.latitude, coords.longitude, {
          constrained: constrained || connectivity === "satellite",
        })
        if (!mounted) return
        setWeather(weatherData)
        setLastUpdated(new Date(weatherData.fetchedAt))
        setUsingCachedWeather(false)
      } catch (error) {
        console.error("Error fetching location/weather:", error)
        if (mounted) {
          setLocationError(error instanceof Error ? error.message : "Unable to fetch weather")
          if (!locationResolved) {
            setLocationAvailable(false)
            setShowManualLocation(true)
          }
          if (cached) {
            setWeather(cached)
            setLastUpdated(new Date(cached.fetchedAt))
            setUsingCachedWeather(true)
          }
        }
      } finally {
        if (mounted) {
          setWeatherLoading(false)
          setWeatherRefreshing(false)
        }
      }
    }

    fetchLocationAndWeather()
    return () => {
      mounted = false
    }
  }, [connectivity, constrained])

  const handleManualWeather = async () => {
    if (!manualLocation.trim()) {
      setLocationError("Enter a city or landmark to fetch weather manually.")
      return
    }

    if (isOffline) {
      setLocationError("Cannot fetch weather while offline. Using cached data if available.")
      return
    }

    try {
      setWeatherLoading(true)
      setLocationError(null)
      setShowManualLocation(true)
      const weatherData = await getWeatherByCity(manualLocation.trim(), {
        constrained: constrained || connectivity === "satellite",
      })
      setWeather(weatherData)
      setLastUpdated(new Date(weatherData.fetchedAt))
      setUsingCachedWeather(false)
    } catch (error) {
      console.error("Manual weather lookup failed:", error)
      setLocationError(
        error instanceof Error ? error.message : "Unable to fetch weather for the provided location.",
      )
    } finally {
      setWeatherLoading(false)
    }
  }

  const lastUpdatedLabel = lastUpdated
    ? `Updated ${lastUpdated.toLocaleString()}${usingCachedWeather ? " (cached)" : ""}`
    : null

  // Get weather icon based on condition
  const getWeatherIcon = (condition: string) => {
    const cond = condition.toLowerCase()
    if (cond.includes("clear") || cond.includes("sun")) return Sun
    if (cond.includes("cloud")) return Cloud
    if (cond.includes("rain")) return CloudRain
    if (cond.includes("drizzle")) return CloudDrizzle
    if (cond.includes("snow")) return CloudSnow
    if (cond.includes("storm") || cond.includes("thunder")) return CloudLightning
    if (cond.includes("mist") || cond.includes("fog") || cond.includes("haze")) return Cloud
    return Sun
  }

  // Format time from Unix timestamp
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return ""
    const date = new Date(timestamp * 1000)
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
  }

  const manualLocationExpanded = showManualLocation || !locationAvailable

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-6 space-y-6">
        {/* Active Trip Card */}
        {currentTrip && (
          <Card className="overflow-hidden border-primary/30">
            <div
              className={cn(
                "h-1.5",
                checkInStatus === "ok" && "bg-safe",
                checkInStatus === "pending" && "bg-warning",
                checkInStatus === "overdue" && "bg-danger animate-pulse",
              )}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Active Trip</CardTitle>
                <span
                  className={cn(
                    "px-2 py-1 rounded-full text-xs font-medium",
                    checkInStatus === "ok" && "bg-safe/20 text-safe",
                    checkInStatus === "pending" && "bg-warning/20 text-warning",
                    checkInStatus === "overdue" && "bg-danger/20 text-danger",
                  )}
                >
                  {checkInStatus === "ok" ? "All Good" : checkInStatus === "pending" ? "Check-in Soon" : "Overdue"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold">{currentTrip.destination}</h3>
                <p className="text-sm text-muted-foreground">{currentTrip.notes}</p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <span className="text-sm">Next Check-in</span>
                </div>
                <span
                  className={cn(
                    "text-lg font-bold",
                    checkInStatus === "ok" && "text-foreground",
                    checkInStatus === "pending" && "text-warning",
                    checkInStatus === "overdue" && "text-danger",
                  )}
                >
                  {timeRemaining}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Navigation className="w-4 h-4" />
                  <span>
                    Day{" "}
                    {Math.max(
                      1,
                      Math.ceil((Date.now() - parseTripDateMs(currentTrip.startDate)) / (1000 * 60 * 60 * 24)),
                    )}{" "}
                    of{" "}
                    {Math.max(
                      1,
                      Math.ceil(
                        (parseTripDateMs(currentTrip.endDate) - parseTripDateMs(currentTrip.startDate)) /
                          (1000 * 60 * 60 * 24),
                      ),
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{currentTrip.checkIns.length} Check-ins</span>
                </div>
              </div>

              <Button
                onClick={onCheckIn}
                className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90"
              >
                <CheckCircle2 className="w-5 h-5 mr-2" />
                Check In Now
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-20 flex-col gap-2 bg-card hover:bg-muted" onClick={onCheckIn}>
              <CheckCircle2 className="w-6 h-6 text-safe" />
              <span>Check In</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2 bg-card hover:bg-muted" onClick={onAddWaypoint}>
              <MapPin className="w-6 h-6 text-accent" />
              <span>Add Waypoint</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2 bg-card hover:bg-muted" onClick={onStartTrip}>
              <Compass className="w-6 h-6 text-primary" />
              <span>Plan Trip</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2 bg-card hover:bg-muted border-danger/30"
              onClick={onSOS}
            >
              <AlertTriangle className="w-6 h-6 text-danger" />
              <span className="text-danger">SOS</span>
            </Button>
          </div>
        </div>

        {/* Weather Strip */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">Local Weather</p>
                {weatherRefreshing && weather && (
                  <p className="text-xs text-muted-foreground">Refreshing with latest conditions...</p>
                )}
                {!weatherRefreshing && lastUpdatedLabel && (
                  <p className="text-xs text-muted-foreground">{lastUpdatedLabel}</p>
                )}
              </div>
              {(usingCachedWeather || isOffline) && (
                <Badge variant="outline" className="text-xs">
                  {isOffline ? "Offline" : "Cached"}
                </Badge>
              )}
            </div>

            {locationError && (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">Location unavailable</p>
                  <p className="text-xs text-warning/90">{locationError}</p>
                </div>
              </div>
            )}

            {weatherLoading && !weather ? (
              <div className="flex items-center justify-center p-4">
                <p className="text-sm text-muted-foreground">Loading weather...</p>
              </div>
            ) : weather ? (
              <>
                {(() => {
                  const WeatherIcon = getWeatherIcon(weather.condition)
                  return (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/20">
                          <WeatherIcon className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{weather.temperature}°F {formatCondition(weather.condition)}</p>
                          <p className="text-sm text-muted-foreground">{weather.location}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1" title="Humidity">
                          <Droplets className="w-4 h-4" />
                          <span>{weather.humidity}%</span>
                        </div>
                        <div className="flex items-center gap-1" title="Wind Speed">
                          <Wind className="w-4 h-4" />
                          <span>{weather.windSpeed}mph</span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
                {weather.sunrise && weather.sunset && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Sunrise {formatTime(weather.sunrise)} • Sunset {formatTime(weather.sunset)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center p-4">
                <p className="text-sm text-muted-foreground">Weather unavailable</p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Manual location</p>
                {locationAvailable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-2 py-1 text-xs"
                    onClick={() => setShowManualLocation((prev) => !prev)}
                  >
                    {manualLocationExpanded ? "Hide" : "Show"}
                    <ChevronDown
                      className={cn(
                        "ml-1 h-3 w-3 transition-transform",
                        manualLocationExpanded && "rotate-180",
                      )}
                    />
                  </Button>
                )}
              </div>
              {manualLocationExpanded && (
                <>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="Enter city or waypoint"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                    />
                    <Button variant="outline" onClick={handleManualWeather} disabled={weatherLoading || isOffline}>
                      Use
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use manual entry if location permission is denied or GPS is unreliable.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Waypoints */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Recent Waypoints</h2>
            <button onClick={() => onNavigate("map")} className="text-xs text-primary font-medium hover:underline">
              View All
            </button>
          </div>
          <div className="space-y-2">
            {waypoints.slice(0, 3).map((waypoint) => (
              <Card key={waypoint.id} className="bg-card hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      waypoint.type === "camp" && "bg-primary/20",
                      waypoint.type === "vehicle" && "bg-accent/20",
                      waypoint.type === "hazard" && "bg-danger/20",
                      waypoint.type === "custom" && "bg-muted",
                    )}
                  >
                    <MapPin
                      className={cn(
                        "w-4 h-4",
                        waypoint.type === "camp" && "text-primary",
                        waypoint.type === "vehicle" && "text-accent",
                        waypoint.type === "hazard" && "text-danger",
                        waypoint.type === "custom" && "text-muted-foreground",
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{waypoint.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{waypoint.notes}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {!isPremium && <BillingSettings title="Upgrade to Pro" compact />}
      </div>
    </div>
  )
}

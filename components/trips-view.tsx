"use client"

import { useState } from "react"
import { Plus, ChevronRight, Calendar, Clock, MapPin, CheckCircle2, AlertCircle, Pause, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useApp } from "./app-provider"
import { cn } from "@/lib/utils"

interface TripsViewProps {
  onStartTrip: () => void
}

export function TripsView({ onStartTrip }: TripsViewProps) {
  const { currentTrip, endTrip } = useApp()
  const [activeTab, setActiveTab] = useState<"active" | "history">("active")

  const pastTrips = [
    {
      id: "past-1",
      destination: "Yellowstone Backcountry",
      startDate: new Date("2024-10-15"),
      endDate: new Date("2024-10-18"),
      checkIns: 12,
      status: "completed" as const,
    },
    {
      id: "past-2",
      destination: "Rocky Mountain NP",
      startDate: new Date("2024-09-22"),
      endDate: new Date("2024-09-24"),
      checkIns: 8,
      status: "completed" as const,
    },
    {
      id: "past-3",
      destination: "Bighorn Mountains",
      startDate: new Date("2024-09-01"),
      endDate: new Date("2024-09-05"),
      checkIns: 15,
      status: "completed" as const,
    },
  ]

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  return (
    <div className="flex-1 overflow-y-auto pb-24">
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Trips</h1>
          <Button onClick={onStartTrip} className="gap-2">
            <Plus className="w-4 h-4" />
            Plan Trip
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 rounded-lg bg-muted">
          <button
            onClick={() => setActiveTab("active")}
            className={cn(
              "flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors",
              activeTab === "active"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Active
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors",
              activeTab === "history"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            History
          </button>
        </div>

        {activeTab === "active" ? (
          <>
            {/* Current Active Trip */}
            {currentTrip ? (
              <Card className="border-primary/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-safe animate-pulse" />
                      Active Now
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Pause className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-danger hover:text-danger"
                        onClick={endTrip}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold">{currentTrip.destination}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{currentTrip.notes}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>
                        {formatDate(currentTrip.startDate)} - {formatDate(currentTrip.endDate)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>Every {currentTrip.checkInCadence}h check-in</span>
                    </div>
                  </div>

                  {/* Check-in Timeline */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">Recent Check-ins</h4>
                    <div className="space-y-3">
                      {currentTrip.checkIns.slice(0, 3).map((checkIn, index) => (
                        <div key={checkIn.id} className="flex items-start gap-3">
                          <div className="flex flex-col items-center">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center",
                                checkIn.status === "ok" ? "bg-safe/20" : "bg-warning/20",
                              )}
                            >
                              <CheckCircle2
                                className={cn("w-4 h-4", checkIn.status === "ok" ? "text-safe" : "text-warning")}
                              />
                            </div>
                            {index < currentTrip.checkIns.length - 1 && <div className="w-0.5 h-8 bg-border mt-1" />}
                          </div>
                          <div className="flex-1 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                {checkIn.status === "ok" ? "All Good" : "Need Help"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {checkIn.timestamp.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{checkIn.notes}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full bg-transparent">
                    View Full Timeline
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <MapPin className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Active Trip</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start a trip to begin tracking your safety check-ins
                  </p>
                  <Button onClick={onStartTrip}>
                    <Plus className="w-4 h-4 mr-2" />
                    Plan a Trip
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Overdue Alerts */}
            <Card className="border-danger/30 bg-danger/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-danger/20">
                    <AlertCircle className="w-5 h-5 text-danger" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-danger">Overdue Alert</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tom Wilson from Weekend Warriors is 2 hours overdue for check-in
                    </p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="destructive">
                        View Details
                      </Button>
                      <Button size="sm" variant="outline">
                        Contact
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* History Tab */
          <div className="space-y-3">
            {pastTrips.map((trip) => (
              <Card key={trip.id} className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{trip.destination}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                          {trip.checkIns} check-ins
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-safe/20 text-safe">Completed</span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

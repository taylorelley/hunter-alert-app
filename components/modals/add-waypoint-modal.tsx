"use client"

import { useState } from "react"
import { X, MapPin, Tent, Car, AlertTriangle, Droplets, Eye, Globe, Lock, Users, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "../app-provider"
import { cn } from "@/lib/utils"

interface AddWaypointModalProps {
  isOpen: boolean
  onClose: () => void
}

const waypointTypes = [
  { id: "camp", label: "Camp", icon: Tent, color: "text-primary" },
  { id: "vehicle", label: "Vehicle", icon: Car, color: "text-accent" },
  { id: "hazard", label: "Hazard", icon: AlertTriangle, color: "text-danger" },
  { id: "water", label: "Water", icon: Droplets, color: "text-blue-500" },
  { id: "viewpoint", label: "Viewpoint", icon: Eye, color: "text-purple-500" },
  { id: "custom", label: "Custom", icon: MapPin, color: "text-muted-foreground" },
]

export function AddWaypointModal({ isOpen, onClose }: AddWaypointModalProps) {
  const { addWaypoint, groups } = useApp()
  const [name, setName] = useState("")
  const [type, setType] = useState<string>("custom")
  const [notes, setNotes] = useState("")
  const [isPrivate, setIsPrivate] = useState(true)
  const [shareToGroup, setShareToGroup] = useState<string | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!name.trim()) return

    addWaypoint({
      name: name.trim(),
      type: type as "camp" | "vehicle" | "hazard" | "water" | "viewpoint" | "custom",
      coordinates: { lat: 43.8 + Math.random() * 0.1, lng: -103.5 + Math.random() * 0.1 },
      notes: notes.trim(),
      isPrivate,
    })

    setIsComplete(true)
    setTimeout(() => {
      setIsComplete(false)
      setName("")
      setNotes("")
      setType("custom")
      setIsPrivate(true)
      setShareToGroup(null)
      onClose()
    }, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
            <h2 className="text-lg font-semibold">Add Waypoint</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {isComplete ? (
            <CardContent className="py-12 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-safe/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-safe" />
              </div>
              <h3 className="text-xl font-semibold">Waypoint Saved!</h3>
              <p className="text-muted-foreground mt-2">{name} has been added to your waypoints.</p>
            </CardContent>
          ) : (
            <CardContent className="p-4 space-y-6">
              {/* Current Location */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span className="font-medium">Using current location</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">43.8042°N, 103.5024°W</p>
              </div>

              {/* Waypoint Type */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {waypointTypes.map((waypointType) => {
                    const Icon = waypointType.icon
                    return (
                      <button
                        key={waypointType.id}
                        onClick={() => setType(waypointType.id)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all",
                          type === waypointType.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        <Icon className={cn("w-5 h-5", waypointType.color)} />
                        <span className="text-xs font-medium">{waypointType.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Base Camp, Truck Parking..."
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add details about this waypoint..."
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-20 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Privacy */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Visibility</label>
                <div className="space-y-2">
                  <button
                    onClick={() => setIsPrivate(true)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                      isPrivate ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                    )}
                  >
                    <Lock className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Private</p>
                      <p className="text-xs text-muted-foreground">Only visible to you</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsPrivate(false)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                      !isPrivate ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                    )}
                  >
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">Shared</p>
                      <p className="text-xs text-muted-foreground">Visible to your groups</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Share to Group */}
              {!isPrivate && groups.length > 0 && (
                <div className="space-y-3">
                  <label className="text-sm font-medium">Share to Group</label>
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => setShareToGroup(shareToGroup === group.id ? null : group.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border transition-all",
                          shareToGroup === group.id
                            ? "border-primary bg-primary/10"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        <Users className="w-5 h-5 text-muted-foreground" />
                        <span className="font-medium text-sm">{group.name}</span>
                        {shareToGroup === group.id && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button onClick={handleSubmit} disabled={!name.trim()} className="w-full h-12 text-base font-semibold">
                <MapPin className="w-5 h-5 mr-2" />
                Save Waypoint
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}

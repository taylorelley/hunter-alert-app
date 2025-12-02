"use client"

import { useEffect, useState } from "react"
import { Loader2, MapPin, Navigation2, Ruler, Shield, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getCurrentPosition } from "@/lib/geolocation"
import { validateGeofenceParams } from "@/lib/validation"

interface GeofenceFormModalProps {
  isOpen: boolean
  mode: "create" | "edit"
  groupName?: string
  initialValues?: {
    id?: string
    name: string
    latitude: number
    longitude: number
    radiusMeters: number
    description?: string
  }
  onClose: () => void
  onSubmit: (payload: {
    name: string
    latitude: number
    longitude: number
    radiusMeters: number
    description?: string
  }) => Promise<void>
}

export function GeofenceFormModal({ isOpen, mode, groupName, initialValues, onClose, onSubmit }: GeofenceFormModalProps) {
  const [name, setName] = useState(initialValues?.name || "")
  const [latitude, setLatitude] = useState(initialValues?.latitude ?? 0)
  const [longitude, setLongitude] = useState(initialValues?.longitude ?? 0)
  const [radiusMeters, setRadiusMeters] = useState(initialValues?.radiusMeters ?? 500)
  const [description, setDescription] = useState(initialValues?.description || "")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLocating, setIsLocating] = useState(false)

  useEffect(() => {
    if (isOpen && initialValues) {
      setName(initialValues.name)
      setLatitude(initialValues.latitude)
      setLongitude(initialValues.longitude)
      setRadiusMeters(initialValues.radiusMeters)
      setDescription(initialValues.description || "")
    } else if (isOpen && !initialValues) {
      setName("")
      setLatitude(0)
      setLongitude(0)
      setRadiusMeters(500)
      setDescription("")
    }

    if (isOpen) {
      setError(null)
    }
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const validate = () => {
    return validateGeofenceParams({
      name,
      latitude,
      longitude,
      radiusMeters,
    })
  }

  const handleUseCurrentLocation = async () => {
    setError(null)
    setIsLocating(true)
    try {
      const position = await getCurrentPosition()
      setLatitude(position.latitude)
      setLongitude(position.longitude)
    } catch (locationError) {
      const message =
        locationError instanceof Error ? locationError.message : "Could not get current location"
      setError(message)
    } finally {
      setIsLocating(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({
        name: name.trim(),
        latitude,
        longitude,
        radiusMeters,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Unable to save the geofence"
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card rounded-t-xl">
            <div>
              <p className="text-xs text-muted-foreground">{groupName ? `For ${groupName}` : "Geofence"}</p>
              <h2 className="text-lg font-semibold">{mode === "create" ? "Add Geofence" : "Edit Geofence"}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close geofence modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="geofence-name" className="text-sm font-medium">
                  Name
                </label>
                <input
                  id="geofence-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Camp perimeter"
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                  required
                  minLength={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="geofence-latitude" className="text-sm font-medium">
                    Latitude
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="geofence-latitude"
                      type="number"
                      value={Number.isNaN(latitude) ? "" : latitude}
                      onChange={(event) => {
                        const val = event.target.value
                        setLatitude(val === "" ? NaN : parseFloat(val))
                      }}
                      step="0.0001"
                      min={-90}
                      max={90}
                      className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="geofence-longitude" className="text-sm font-medium">
                    Longitude
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="geofence-longitude"
                      type="number"
                      value={Number.isNaN(longitude) ? "" : longitude}
                      onChange={(event) => {
                        const val = event.target.value
                        setLongitude(val === "" ? NaN : parseFloat(val))
                      }}
                      step="0.0001"
                      min={-180}
                      max={180}
                      className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="geofence-radius" className="text-sm font-medium">
                  Radius (meters)
                </label>
                <div className="relative">
                  <Ruler className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="geofence-radius"
                    type="number"
                    value={Number.isNaN(radiusMeters) ? "" : radiusMeters}
                    onChange={(event) => {
                      const val = event.target.value
                      setRadiusMeters(val === "" ? NaN : parseFloat(val))
                    }}
                    min={1}
                    max={100000}
                    step={10}
                    className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="geofence-description" className="text-sm font-medium">
                  Description (optional)
                </label>
                <textarea
                  id="geofence-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Notes about this boundary..."
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-20 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                />
              </div>

              <Button
                type="button"
                variant="outline"
                className={cn("w-full h-11", (isSubmitting || isLocating) && "opacity-70")}
                onClick={handleUseCurrentLocation}
                disabled={isSubmitting || isLocating}
              >
                {isLocating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Navigation2 className="w-4 h-4 mr-2" />
                )}
                {isLocating ? "Locating..." : "Use current location"}
              </Button>

              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              <Button type="submit" className="w-full h-11" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Shield className="w-4 h-4 mr-2" />}
                {isSubmitting ? "Saving..." : mode === "create" ? "Create geofence" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

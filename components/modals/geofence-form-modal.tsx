"use client"

import { useEffect, useState } from "react"
import { Loader2, MapPin, Ruler, Shield, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

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

  useEffect(() => {
    if (initialValues) {
      setName(initialValues.name)
      setLatitude(initialValues.latitude)
      setLongitude(initialValues.longitude)
      setRadiusMeters(initialValues.radiusMeters)
      setDescription(initialValues.description || "")
    }
  }, [initialValues])

  if (!isOpen) return null

  const validate = () => {
    const trimmedName = name.trim()
    if (!trimmedName) return "Geofence name is required"
    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) return "Latitude must be between -90 and 90"
    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) return "Longitude must be between -180 and 180"
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 100000)
      return "Radius must be between 1 and 100000 meters"
    return null
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
                <label className="text-sm font-medium">Name</label>
                <input
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
                  <label className="text-sm font-medium">Latitude</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={latitude}
                      onChange={(event) => setLatitude(Number(event.target.value))}
                      step="0.0001"
                      min={-90}
                      max={90}
                      className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Longitude</label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="number"
                      value={longitude}
                      onChange={(event) => setLongitude(Number(event.target.value))}
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
                <label className="text-sm font-medium">Radius (meters)</label>
                <div className="relative">
                  <Ruler className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    value={radiusMeters}
                    onChange={(event) => setRadiusMeters(Number(event.target.value))}
                    min={1}
                    max={100000}
                    step={10}
                    className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Notes about this boundary..."
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-20 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                />
              </div>

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

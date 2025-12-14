"use client"

import { useEffect, useState } from "react"
import { X, MapPin, Clock, Users, FileText, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Trip, useApp, FREE_MIN_CHECKIN_CADENCE_HOURS } from "../app-provider"
import { cn } from "@/lib/utils"

interface PlanTripModalProps {
  isOpen: boolean
  onClose: () => void
  trip?: Trip | null
}

const formatDateLocalYYYYMMDD = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function PlanTripModal({ isOpen, onClose, trip }: PlanTripModalProps) {
  const { startTrip, updateTrip, emergencyContacts, refresh, isPremium } = useApp()
  const [step, setStep] = useState(1)
  const [destination, setDestination] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [checkInCadence, setCheckInCadence] = useState(
    isPremium ? 4 : FREE_MIN_CHECKIN_CADENCE_HOURS,
  )
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const [isComplete, setIsComplete] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = Boolean(trip?.id)

  useEffect(() => {
    if (!isOpen) return
    if (trip) {
      setDestination(trip.destination)
      setStartDate(formatDateLocalYYYYMMDD(trip.startDate))
      setEndDate(formatDateLocalYYYYMMDD(trip.endDate))
      setCheckInCadence(trip.checkInCadence)
      setSelectedContacts(trip.emergencyContacts)
      setNotes(trip.notes)
    } else {
      setDestination("")
      setStartDate("")
      setEndDate("")
      setCheckInCadence(isPremium ? 4 : FREE_MIN_CHECKIN_CADENCE_HOURS)
      setSelectedContacts(emergencyContacts.map((c) => c.name))
      setNotes("")
    }
    setStep(1)
    setIsComplete(false)
    setError(null)
  }, [emergencyContacts, isOpen, isPremium, trip])

  if (!isOpen) return null

  const totalSteps = 4

  const canProceed = () => {
    switch (step) {
      case 1:
        if (!destination.trim() || !startDate || !endDate) return false
        // Validate that end date is after start date
        const start = new Date(startDate)
        const end = new Date(endDate)
        return end >= start
      case 2:
        return checkInCadence > 0
      case 3:
        return selectedContacts.length > 0
      case 4:
        return true
      default:
        return false
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = {
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        checkInCadence,
        emergencyContacts: selectedContacts,
        notes,
        status: trip?.status ?? "active",
      }

      if (isEditing && trip) {
        await updateTrip(trip.id, payload)
      } else {
        const { status: _ignoredStatus, ...createPayload } = payload
        await startTrip(createPayload)
      }

      await refresh()
      setIsComplete(true)
      setTimeout(() => {
        setIsComplete(false)
        setStep(1)
        setDestination("")
        setStartDate("")
        setEndDate("")
        setCheckInCadence(isPremium ? 4 : FREE_MIN_CHECKIN_CADENCE_HOURS)
        setSelectedContacts([])
        setNotes("")
        onClose()
      }, 2000)
    } catch (err) {
      console.error(err)
      const isAuthError = (error: unknown) => {
        if (typeof error === "object" && error !== null) {
          const { status, code } = error as { status?: number; code?: string }
          if (status === 401 || code === "UNAUTHORIZED") {
            return true
          }
        }

        if (error instanceof Error && /auth|unauthorized/i.test(error.message)) {
          return true
        }

        return false
      }

      if (isAuthError(err)) {
        setError("Sign in is required before you can manage a trip.")
      } else {
        setError("An error occurred while managing the trip. Please try again.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleContact = (name: string) => {
    setSelectedContacts((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]))
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto max-h-[85vh] overflow-y-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
            <h2 className="text-lg font-semibold">{isEditing ? "Edit Trip" : "Plan Trip"}</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress */}
          {!isComplete && (
            <div className="px-4 pt-4">
              <div className="flex items-center justify-between mb-2">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                      s < step
                        ? "bg-primary text-primary-foreground"
                        : s === step
                          ? "bg-primary/20 text-primary border-2 border-primary"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
                  </div>
                ))}
              </div>
              <div className="h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
                />
              </div>
            </div>
          )}

          {isComplete ? (
            <CardContent className="py-12 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-safe/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-safe" />
              </div>
              <h3 className="text-xl font-semibold">{isEditing ? "Trip Updated!" : "Trip Started!"}</h3>
              <p className="text-muted-foreground mt-2">Stay safe out there. Your contacts have been notified.</p>
            </CardContent>
          ) : (
            <CardContent className="p-4 space-y-6">
              {/* Step 1: Destination & Dates */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <MapPin className="w-5 h-5" />
                    <h3 className="font-semibold">Where are you going?</h3>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination</label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g., Black Hills National Forest"
                      className="w-full p-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Start Date</label>
                        <input
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">End Date</label>
                        <input
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>
                    {startDate && endDate && new Date(endDate) < new Date(startDate) && (
                      <p className="text-sm text-danger">End date must be after start date</p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Check-in Cadence */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="w-5 h-5" />
                    <h3 className="font-semibold">Check-in Schedule</h3>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    How often would you like to check in? You&apos;ll receive reminders when a check-in is due.
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {[2, 4, 6, 8, 12, 24].map((hours) => {
                      const locked = !isPremium && hours < FREE_MIN_CHECKIN_CADENCE_HOURS
                      return (
                        <button
                          key={hours}
                          onClick={() => !locked && setCheckInCadence(hours)}
                          disabled={locked}
                          className={cn(
                            "p-4 rounded-lg border-2 transition-all text-center",
                            checkInCadence === hours
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50",
                            locked && "opacity-60 cursor-not-allowed",
                          )}
                        >
                          <span className="text-2xl font-bold">{hours}</span>
                          <span className="text-sm text-muted-foreground block">hours</span>
                          {locked && <span className="mt-2 inline-block text-xs text-accent font-semibold">Pro</span>}
                        </button>
                      )
                    })}
                  </div>

                  <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-warning mt-0.5" />
                      <p className="text-sm text-muted-foreground">
                        If you miss a check-in, your emergency contacts will be notified after a 30-minute grace period.
                      </p>
                    </div>
                  </div>

                  {!isPremium && (
                    <p className="text-xs text-muted-foreground">
                      Faster than every {FREE_MIN_CHECKIN_CADENCE_HOURS} hours is part of Pro. Upgrade in billing settings to
                      enable tighter check-in cadences.
                    </p>
                  )}
                </div>
              )}

              {/* Step 3: Emergency Contacts */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Users className="w-5 h-5" />
                    <h3 className="font-semibold">Emergency Contacts</h3>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    Select who should be notified about this trip and receive your check-ins.
                  </p>

                  <div className="space-y-2">
                    {emergencyContacts.map((contact) => (
                      <button
                        key={contact.name}
                        onClick={() => toggleContact(contact.name)}
                        className={cn(
                          "w-full flex items-center gap-3 p-4 rounded-lg border-2 transition-all",
                          selectedContacts.includes(contact.name)
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50",
                        )}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium",
                            selectedContacts.includes(contact.name)
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {contact.name.charAt(0)}
                        </div>
                        <div className="text-left flex-1">
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-muted-foreground">{contact.phone}</p>
                        </div>
                        {selectedContacts.includes(contact.name) && <CheckCircle2 className="w-5 h-5 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Review */}
              {step === 4 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <FileText className="w-5 h-5" />
                    <h3 className="font-semibold">Review &amp; {isEditing ? "Save" : "Start"}</h3>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Destination</p>
                      <p className="font-medium">{destination}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Dates</p>
                        <p className="font-medium text-sm">
                          {new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
                          {new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Check-in</p>
                        <p className="font-medium text-sm">Every {checkInCadence} hours</p>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Emergency Contacts</p>
                      <p className="font-medium text-sm">{selectedContacts.join(", ")}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any additional details about your trip..."
                      className="w-full p-3 rounded-lg bg-input border border-border resize-none h-20 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {error && <p className="text-sm text-danger">{error}</p>}
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-4">
                {step > 1 && (
                  <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>
                )}
                {step < totalSteps ? (
                  <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} className="flex-1">
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-safe hover:bg-safe/90 text-safe-foreground"
                  >
                    {isSubmitting ? (isEditing ? "Saving..." : "Starting...") : isEditing ? "Save Changes" : "Start Trip"}
                  </Button>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}

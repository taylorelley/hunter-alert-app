"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { X, AlertTriangle, Phone, Radio, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "../app-provider"
import { cn } from "@/lib/utils"

interface SOSModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SOSModal({ isOpen, onClose }: SOSModalProps) {
  const { triggerSOS, cancelSOS, resolveSOS, sosActive, sosStatus, lastSOSLocation, emergencyContacts } = useApp()
  const [countdown, setCountdown] = useState(5)
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [sosType, setSOSType] = useState<"full" | "silent">("full")
  const [isSent, setIsSent] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetModal = useCallback(() => {
    setCountdown(5)
    setIsCountingDown(false)
    setIsSent(false)
    setSOSType("full")
    setActionError(null)
    setIsSubmitting(false)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetModal()
    }
  }, [isOpen, resetModal])

  useEffect(() => {
    if (isCountingDown && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
      return () => clearTimeout(timer)
    } else if (isCountingDown && countdown === 0) {
      setIsSubmitting(true)
      triggerSOS(sosType === "silent")
        .then(() => {
          setIsSent(true)
          setIsCountingDown(false)
        })
        .catch((error) => {
          console.error("Failed to send SOS", error)
          setActionError(error instanceof Error ? error.message : "Unable to send SOS alert")
          setIsCountingDown(false)
        })
        .finally(() => setIsSubmitting(false))
    }
  }, [isCountingDown, countdown, sosType, triggerSOS])

  useEffect(() => {
    if (sosStatus !== "idle" && !isCountingDown) {
      setIsSent(true)
    }
  }, [isCountingDown, sosStatus])

  if (!isOpen) return null

  const handleStartSOS = (type: "full" | "silent") => {
    setActionError(null)
    setSOSType(type)
    setIsCountingDown(true)
  }

  const handleCancel = async () => {
    if (sosActive) {
      setIsSubmitting(true)
      setActionError(null)
      try {
        await cancelSOS()
      } catch (error) {
        console.error("Failed to cancel SOS", error)
        setActionError(error instanceof Error ? error.message : "Unable to cancel SOS")
      } finally {
        setIsSubmitting(false)
      }
    }
    onClose()
  }

  const handleResolve = async () => {
    setIsSubmitting(true)
    setActionError(null)
    try {
      await resolveSOS()
      setIsSent(true)
    } catch (error) {
      console.error("Failed to resolve SOS", error)
      setActionError(error instanceof Error ? error.message : "Unable to resolve SOS")
    } finally {
      setIsSubmitting(false)
    }
  }

  const deliveryStatus = useMemo(() => {
    switch (sosStatus) {
      case "queued":
        return "Queued for sync—will send when network allows"
      case "sending":
        return "Sending alert to Supabase..."
      case "delivered":
        return "Alert delivered to backend"
      case "canceled":
        return "SOS canceled and contacts notified"
      case "resolved":
        return "SOS resolved and contacts notified"
      case "failed":
        return "Delivery failed—will retry when online"
      default:
        return "Not sent yet"
    }
  }, [sosStatus])

  const statusBadgeClass = useMemo(() => {
    switch (sosStatus) {
      case "delivered":
        return "bg-primary/10 text-primary"
      case "queued":
      case "sending":
        return "bg-warning/20 text-warning"
      case "canceled":
      case "resolved":
        return "bg-safe/20 text-safe"
      case "failed":
        return "bg-danger/20 text-danger"
      default:
        return "bg-muted text-foreground"
    }
  }, [sosStatus])

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl border-danger/30">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-danger flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Emergency SOS
            </h2>
            <button onClick={handleCancel} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4">
            {isSent ? (
              <div className="py-8 text-center space-y-4">
                <div
                  className={cn(
                    "w-24 h-24 mx-auto rounded-full flex items-center justify-center",
                    sosStatus === "canceled" || sosStatus === "resolved"
                      ? "bg-safe/20"
                      : sosType === "full"
                        ? "bg-danger/20 animate-pulse"
                        : "bg-warning/20",
                  )}
                >
                  {sosType === "full" ? (
                    <AlertTriangle className="w-12 h-12 text-danger" />
                  ) : (
                    <Radio className="w-12 h-12 text-warning" />
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-bold">
                    {sosStatus === "canceled" || sosStatus === "resolved"
                      ? "SOS Closed"
                      : sosType === "full"
                        ? "SOS Sent"
                        : "Silent Alarm Sent"}
                  </h3>
                  <p className="text-muted-foreground mt-1">{deliveryStatus}</p>
                </div>

                <div className="p-4 rounded-lg bg-muted/50 text-left space-y-2">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>Delivery status</span>
                    <span className={cn("px-2 py-1 rounded-full text-xs", statusBadgeClass)}>{sosStatus.toUpperCase()}</span>
                  </div>
                  {lastSOSLocation ? (
                    <p className="text-xs text-muted-foreground">
                      Location attached: {lastSOSLocation.lat.toFixed(4)}°, {lastSOSLocation.lng.toFixed(4)}°
                      {typeof lastSOSLocation.accuracy === "number"
                        ? ` (±${Math.round(lastSOSLocation.accuracy)}m)`
                        : ""}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Location will be captured from your device when sending
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-lg bg-muted/50 text-left space-y-2">
                  <p className="text-sm font-medium">Notifying:</p>
                  {emergencyContacts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No emergency contacts configured</p>
                  ) : (
                    emergencyContacts.map((contact, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle2
                          className={cn(
                            "w-4 h-4",
                            sosStatus === "queued" || sosStatus === "sending" ? "text-warning" : "text-safe",
                          )}
                        />
                        <span className="flex-1 text-left">{contact.name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{sosStatus}</span>
                      </div>
                    ))
                  )}
                </div>

                {actionError && <p className="text-sm text-danger text-left">{actionError}</p>}

                <div className="space-y-2 pt-4">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleCancel}
                    disabled={isSubmitting || sosStatus === "canceled" || sosStatus === "resolved"}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancel SOS
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleResolve}
                    disabled={isSubmitting || sosStatus === "resolved" || sosStatus === "canceled"}
                  >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Mark Resolved & Notify
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Canceling or resolving will notify contacts that you are safe
                  </p>
                </div>
              </div>
            ) : isCountingDown ? (
              <div className="py-8 text-center space-y-6">
                <div className="relative w-32 h-32 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-danger/20" />
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="46"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      strokeDasharray={`${(countdown / 5) * 289} 289`}
                      className="text-danger transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl font-bold text-danger">{countdown}</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-bold">Sending {sosType === "full" ? "SOS" : "Silent Alarm"}...</h3>
                  <p className="text-muted-foreground mt-2">Tap cancel if this was a mistake</p>
                </div>

                <Button
                  variant="outline"
                  size="lg"
                  className="w-full bg-transparent"
                  onClick={() => {
                    setIsCountingDown(false)
                    setCountdown(5)
                  }}
                >
                  Cancel
                </Button>
                {actionError && <p className="text-sm text-danger">{actionError}</p>}
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-center text-muted-foreground">
                  This will alert your emergency contacts with your current location and trip details.
                </p>

                <div className="space-y-3">
                  <button
                    onClick={() => handleStartSOS("full")}
                    className="w-full p-4 rounded-xl border-2 border-danger bg-danger/10 hover:bg-danger/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-full bg-danger/20">
                        <Phone className="w-6 h-6 text-danger" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-danger">Full SOS</h3>
                        <p className="text-sm text-muted-foreground">Alert contacts with audible notification</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleStartSOS("silent")}
                    className="w-full p-4 rounded-xl border-2 border-warning bg-warning/10 hover:bg-warning/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-full bg-warning/20">
                        <Radio className="w-6 h-6 text-warning" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-warning">Silent Alarm</h3>
                        <p className="text-sm text-muted-foreground">Discreet alert without sounds or vibration</p>
                      </div>
                    </div>
                  </button>
                </div>

                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground text-center">
                    {lastSOSLocation
                      ? `Your location will be shared: ${lastSOSLocation.lat.toFixed(4)}°, ${lastSOSLocation.lng.toFixed(4)}°`
                      : "Your location will be shared with the alert once captured."}
                    <br />
                    Cancel anytime before the countdown finishes.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

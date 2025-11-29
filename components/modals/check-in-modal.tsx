"use client"

import { useState } from "react"
import { X, CheckCircle2, AlertTriangle, Battery, Signal, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "../app-provider"
import { cn } from "@/lib/utils"

interface CheckInModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CheckInModal({ isOpen, onClose }: CheckInModalProps) {
  const { checkIn, currentTrip } = useApp()
  const [status, setStatus] = useState<"ok" | "need-help">("ok")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setIsSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    checkIn(status, notes)
    setIsComplete(true)
    setTimeout(() => {
      setIsComplete(false)
      setNotes("")
      setStatus("ok")
      onClose()
    }, 1500)
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Check In</h2>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {isComplete ? (
            <CardContent className="py-12 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-safe/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-safe" />
              </div>
              <h3 className="text-xl font-semibold">Check-in Sent!</h3>
              <p className="text-muted-foreground mt-2">Your contacts have been notified.</p>
            </CardContent>
          ) : (
            <CardContent className="p-4 space-y-6">
              {/* Trip Context */}
              {currentTrip && (
                <div className="p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="font-medium">{currentTrip.destination}</p>
                  <p className="text-muted-foreground">{currentTrip.notes}</p>
                </div>
              )}

              {/* Status Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium">How are you doing?</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setStatus("ok")}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all",
                      status === "ok" ? "border-safe bg-safe/10" : "border-border hover:border-safe/50",
                    )}
                  >
                    <CheckCircle2
                      className={cn("w-8 h-8 mx-auto mb-2", status === "ok" ? "text-safe" : "text-muted-foreground")}
                    />
                    <span className={cn("font-medium", status === "ok" ? "text-safe" : "text-muted-foreground")}>
                      All Good
                    </span>
                  </button>
                  <button
                    onClick={() => setStatus("need-help")}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all",
                      status === "need-help" ? "border-warning bg-warning/10" : "border-border hover:border-warning/50",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "w-8 h-8 mx-auto mb-2",
                        status === "need-help" ? "text-warning" : "text-muted-foreground",
                      )}
                    />
                    <span
                      className={cn("font-medium", status === "need-help" ? "text-warning" : "text-muted-foreground")}
                    >
                      Need Help
                    </span>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a quick note about your status..."
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-24 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Device Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <Battery className="w-4 h-4 text-safe" />
                    <span>78%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Signal className="w-4 h-4 text-safe" />
                    <span>Good signal</span>
                  </div>
                </div>
                <span className="text-muted-foreground">Auto-captured</span>
              </div>

              {/* Submit Button */}
              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full h-12 text-base font-semibold">
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Sending...
                  </span>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Send Check-in
                  </>
                )}
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}

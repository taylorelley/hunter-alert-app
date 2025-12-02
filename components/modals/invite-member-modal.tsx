"use client"

import { useMemo, useState } from "react"
import { AtSign, Loader2, Shield, UserPlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface InviteMemberModalProps {
  isOpen: boolean
  groupName?: string
  onClose: () => void
  onSubmit: (params: { email: string; role: "member" | "admin" }) => Promise<void>
}

export function InviteMemberModal({ isOpen, onClose, onSubmit, groupName }: InviteMemberModalProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"member" | "admin">("member")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isValidEmail = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email])

  if (!isOpen) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!email.trim()) {
      setError("Recipient email is required")
      return
    }

    if (!isValidEmail) {
      setError("Enter a valid email address")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({ email: email.trim(), role })
      setEmail("")
      setRole("member")
      onClose()
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Could not send the invite"
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
              <p className="text-xs text-muted-foreground">Invite to {groupName || "group"}</p>
              <h2 className="text-lg font-semibold">New Member Invitation</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close invite modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Recipient email</label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="member@example.com"
                    className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isSubmitting}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Role</label>
                <div className="grid grid-cols-2 gap-3">
                  {["member", "admin"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setRole(option as "member" | "admin")}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-all",
                        role === option ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                      )}
                      disabled={isSubmitting}
                    >
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold capitalize">{option}</p>
                        <p className="text-xs text-muted-foreground">
                          {option === "admin" ? "Manage members & alerts" : "View and participate"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              <Button type="submit" className="w-full h-11" disabled={isSubmitting || !isValidEmail}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                {isSubmitting ? "Sending..." : "Send invite"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

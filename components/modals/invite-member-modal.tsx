"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AtSign, Loader2, Shield, UserPlus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { isValidEmail } from "@/lib/validation"

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
  const modalRef = useRef<HTMLDivElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setEmail("")
      setRole("member")
      setError(null)
      emailInputRef.current?.focus()
    }
  }, [isOpen])

  const isEmailValid = useMemo(() => isValidEmail(email), [email])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return

      if (event.key === "Escape" && !isSubmitting) {
        onClose()
      }

      if (event.key === "Tab" && modalRef.current) {
        const focusable = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"))

        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
      }
    },
    [isOpen, isSubmitting, onClose],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!email.trim()) {
      setError("Recipient email is required")
      return
    }

    if (!isEmailValid) {
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
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto" ref={modalRef}>
        <Card className="shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
                <label htmlFor="invite-email" className="text-sm font-medium">
                  Recipient email
                </label>
                <div className="relative">
                  <AtSign className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="member@example.com"
                    className="w-full pl-9 pr-3 py-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={isSubmitting}
                    ref={emailInputRef}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="invite-role-member" className="text-sm font-medium">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {["member", "admin"].map((option) => (
                    <label
                      key={option}
                      htmlFor={`invite-role-${option}`}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 p-3 rounded-lg border-2 text-left transition-all",
                        role === option ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                        isSubmitting && "cursor-not-allowed opacity-70",
                      )}
                    >
                      <input
                        id={`invite-role-${option}`}
                        name="invite-role"
                        type="radio"
                        value={option}
                        checked={role === option}
                        onChange={() => setRole(option as "member" | "admin")}
                        className="sr-only"
                        disabled={isSubmitting}
                      />
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold capitalize">{option}</p>
                        <p className="text-xs text-muted-foreground">
                          {option === "admin" ? "Manage members & alerts" : "View and participate"}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              <Button type="submit" className="w-full h-11" disabled={isSubmitting || !isEmailValid}>
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

"use client"

import { useEffect, useRef, useState } from "react"
import { X, MessageSquare, Mail, Phone, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmergencyContact } from "../app-provider"

interface TestNotificationModalProps {
  isOpen: boolean
  onClose: () => void
  contacts: EmergencyContact[]
  onSend: (options: { contactId: string; channel?: "sms" | "email" }) => Promise<void>
}

export function TestNotificationModal({ isOpen, onClose, contacts, onSend }: TestNotificationModalProps) {
  const [contactId, setContactId] = useState<string>("")
  const [channel, setChannel] = useState<"sms" | "email">("sms")
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const closeTimeoutRef = useRef<number | null>(null)
  const selectedContact = contacts.find((contact) => contact.id === contactId)
  const contactPhone = selectedContact?.phone
  const contactEmail = selectedContact?.email

  useEffect(() => {
    if (!isOpen) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
      return
    }
    setError(null)
    setSuccessMessage(null)
    setIsSending(false)
    const preferred = contacts.find((contact) => contact.phone) ?? contacts[0]
    setContactId(preferred?.id ?? "")
    setChannel(preferred?.phone ? "sms" : "email")
  }, [contacts, isOpen])

  useEffect(() => {
    if (!selectedContact) return
    if (channel === "sms" && !contactPhone && contactEmail) {
      setChannel("email")
    } else if (channel === "email" && !contactEmail && contactPhone) {
      setChannel("sms")
    }
  }, [channel, contactEmail, contactPhone, selectedContact])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSending) {
        onClose()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, isSending, onClose])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
        closeTimeoutRef.current = null
      }
    }
  }, [])

  if (!isOpen) return null

  const handleSend = async () => {
    setError(null)
    setSuccessMessage(null)

    if (!contactId) {
      setError("Select a contact to notify")
      return
    }

    if (channel === "sms" && !selectedContact?.phone) {
      setError("This contact is missing a phone number for SMS")
      return
    }

    if (channel === "email" && !selectedContact?.email) {
      setError("This contact is missing an email address")
      return
    }

    setIsSending(true)
    try {
      await onSend({ contactId, channel })
      setSuccessMessage(`Test notification queued. Sending via ${channel === "sms" ? "SMS" : "email"}.`)
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current)
      }
      closeTimeoutRef.current = window.setTimeout(() => {
        closeTimeoutRef.current = null
        onClose()
      }, 1200)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Unable to send the test notification")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Send test notification</h2>
            </div>
            <button
              onClick={isSending ? undefined : onClose}
              disabled={isSending}
              aria-disabled={isSending}
              className={`p-2 rounded-lg transition-colors ${
                isSending ? "opacity-50 cursor-not-allowed" : "hover:bg-muted"
              }`}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <label htmlFor="contact-select" className="text-sm font-medium">
                Choose contact
              </label>
              <select
                id="contact-select"
                className="w-full p-3 rounded-lg bg-input border border-border text-sm"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="" disabled>
                  Select a contact
                </option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name} • {contact.phone || contact.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Channel</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => selectedContact?.phone && setChannel("sms")}
                  disabled={!selectedContact?.phone}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                    channel === "sms" ? "border-primary bg-primary/10" : "border-border bg-input"
                  } ${selectedContact?.phone ? "" : "opacity-50 cursor-not-allowed"}`}
                >
                  <Phone className="w-4 h-4" /> SMS
                </button>
                <button
                  type="button"
                  onClick={() => selectedContact?.email && setChannel("email")}
                  disabled={!selectedContact?.email}
                  className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                    channel === "email" ? "border-primary bg-primary/10" : "border-border bg-input"
                  } ${selectedContact?.email ? "" : "opacity-50 cursor-not-allowed"}`}
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
            {successMessage && (
              <p className="text-sm text-safe flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {successMessage}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSending}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={
                  isSending ||
                  contacts.length === 0 ||
                  (channel === "sms" && !selectedContact?.phone) ||
                  (channel === "email" && !selectedContact?.email)
                }
              >
                {isSending ? "Sending..." : "Send test"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

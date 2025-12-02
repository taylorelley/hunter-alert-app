"use client"

import { useEffect, useState } from "react"
import { X, Phone, Mail, UserRound, Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmergencyContact } from "../app-provider"

interface EmergencyContactModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (contact: Omit<EmergencyContact, "id">) => Promise<void>
  initialContact?: EmergencyContact | null
}

export function EmergencyContactModal({ isOpen, onClose, onSubmit, initialContact }: EmergencyContactModalProps) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [relationship, setRelationship] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setName(initialContact?.name ?? "")
    setPhone(initialContact?.phone ?? "")
    setEmail(initialContact?.email ?? "")
    setRelationship(initialContact?.relationship ?? "")
    setFieldErrors({})
    setFormError(null)
    setIsSaving(false)
  }, [initialContact, isOpen])

  if (!isOpen) return null

  const validate = () => {
    const errors: Record<string, string> = {}
    if (!name.trim()) {
      errors.name = "Name is required"
    }
    if (!phone.trim() && !email.trim()) {
      errors.contact = "Add a phone number or email so we can notify them"
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsSaving(true)
    setFormError(null)

    try {
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        relationship: relationship.trim() || undefined,
      })
      onClose()
    } catch (error) {
      console.error(error)
      setFormError(
        error instanceof Error ? error.message : "Unable to save the contact right now. Try again when online.",
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">
                {initialContact ? "Edit Emergency Contact" : "Add Emergency Contact"}
              </h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <UserRound className="w-4 h-4 text-muted-foreground" />
                Full name
              </label>
              <input
                className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Taylor Emergency"
              />
              {fieldErrors.name && <p className="text-xs text-danger">{fieldErrors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  Phone (SMS)
                </label>
                <input
                  type="tel"
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555-123-4567"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  Email (optional)
                </label>
                <input
                  type="email"
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
            </div>
            {fieldErrors.contact && <p className="text-xs text-danger">{fieldErrors.contact}</p>}

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Heart className="w-4 h-4 text-muted-foreground" />
                Relationship
              </label>
              <input
                className="w-full p-3 rounded-lg bg-input border border-border text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="Partner, parent, friend, guide"
              />
            </div>

            {formError && <p className="text-sm text-danger">{formError}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? "Saving..." : initialContact ? "Save changes" : "Add contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

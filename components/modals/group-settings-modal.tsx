"use client"

import { useState, useEffect, type FormEvent } from "react"
import { X, Loader2, Settings } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type Group } from "@/components/app-provider"

interface GroupSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  group: Group | null
  onSubmit: (groupId: string, updates: { name: string; description?: string }) => Promise<void>
}

export function GroupSettingsModal({ isOpen, onClose, group, onSubmit }: GroupSettingsModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Initialize form when group changes
  useEffect(() => {
    if (group) {
      setName(group.name)
      setDescription(group.description || "")
    }
  }, [group])

  if (!isOpen || !group) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()

    if (trimmedName.length < 3) {
      setError("Group name must be at least 3 characters")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit(group.id, { name: trimmedName, description: description.trim() || undefined })
      onClose()
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Could not update the group"
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Normalize both sides to detect transitions between "" and undefined/null
  const normalizedDescription = description.trim() === "" ? undefined : description.trim()
  const normalizedGroupDescription = group.description == null ? undefined : group.description.trim()
  const hasChanges = name.trim() !== group.name || normalizedDescription !== normalizedGroupDescription

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-lg mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border bg-card rounded-t-xl">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Group Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close group settings modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label htmlFor="group-name" className="text-sm font-medium">
                  Group name
                </label>
                <input
                  id="group-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Backcountry crew"
                  className="w-full p-3 rounded-lg bg-input border border-border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                  required
                  minLength={3}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="group-description" className="text-sm font-medium">
                  Description (optional)
                </label>
                <textarea
                  id="group-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Who is in this group and what are you coordinating?"
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-24 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                />
              </div>

              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1 h-11"
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1 h-11"
                  disabled={isSubmitting || name.trim().length < 3 || !hasChanges}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
                  {isSubmitting ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

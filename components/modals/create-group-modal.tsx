"use client"

import { useState } from "react"
import { X, Loader2, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (payload: { name: string; description?: string }) => Promise<void>
}

export function CreateGroupModal({ isOpen, onClose, onSubmit }: CreateGroupModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmedName = name.trim()

    if (!trimmedName) {
      setError("Group name is required")
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onSubmit({ name: trimmedName, description: description.trim() || undefined })
      setName("")
      setDescription("")
      onClose()
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "Could not create the group"
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
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Create Group</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close create group modal"
              disabled={isSubmitting}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium">Group name</label>
                <input
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
                <label className="text-sm font-medium">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Who is in this group and what are you coordinating?"
                  className="w-full p-3 rounded-lg bg-input border border-border resize-none h-24 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={isSubmitting}
                />
              </div>

              {error && <p className="text-sm text-danger" role="alert">{error}</p>}

              <Button type="submit" className="w-full h-11" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Users className="w-4 h-4 mr-2" />}
                {isSubmitting ? "Creating..." : "Create group"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

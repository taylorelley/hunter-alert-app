"use client"

import { useState } from "react"
import { X, AlertTriangle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface DeleteContactModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  contactName: string
  contactDetails?: string
  errorMessage?: string | null
}

export function DeleteContactModal({
  isOpen,
  onClose,
  onConfirm,
  contactName,
  contactDetails,
  errorMessage,
}: DeleteContactModalProps) {
  const [isSaving, setIsSaving] = useState(false)

  if (!isOpen) return null

  const handleClose = () => {
    if (isSaving) return
    onClose()
  }

  const handleConfirm = async () => {
    setIsSaving(true)
    try {
      await onConfirm()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto">
        <Card className="shadow-2xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2 text-danger">
              <AlertTriangle className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Delete contact</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              aria-label="Close"
              disabled={isSaving}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This removes <span className="font-semibold text-foreground">{contactName}</span> from emergency alerts. You can add
              them again later.
            </p>
            {contactDetails && <p className="text-xs text-muted-foreground">{contactDetails}</p>}
            {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirm}
                className="flex items-center gap-2"
                disabled={isSaving}
              >
                <Trash2 className="w-4 h-4" />
                {isSaving ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

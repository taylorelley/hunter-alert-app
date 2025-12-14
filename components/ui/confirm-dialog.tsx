"use client"

import * as React from "react"
import { X, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Card, CardContent } from "./card"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: "default" | "danger"
  onConfirm: () => void | Promise<void>
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Confirm Action",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  const [isProcessing, setIsProcessing] = React.useState(false)

  if (!open) return null

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      console.error("Confirm action failed:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    if (!isProcessing && !isLoading) {
      onOpenChange(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto">
        <Card className="shadow-2xl border-border">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {variant === "danger" && <AlertTriangle className="w-5 h-5 text-danger" />}
              {title}
            </h2>
            <button
              onClick={handleCancel}
              disabled={isProcessing || isLoading}
              className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <CardContent className="p-6 space-y-6">
            <p className="text-sm text-muted-foreground">{description}</p>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isProcessing || isLoading}
                className="flex-1"
              >
                {cancelText}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={isProcessing || isLoading}
                className={cn(
                  "flex-1",
                  variant === "danger" && "bg-danger hover:bg-danger/90 text-danger-foreground",
                )}
              >
                {isProcessing || isLoading ? "Processing..." : confirmText}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

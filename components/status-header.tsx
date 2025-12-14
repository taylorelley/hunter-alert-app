"use client"

import { CheckCheck, CloudOff, Loader2, RadioTower, Satellite, Shield, UserRound, Wifi } from "lucide-react"
import type { JSX } from "react"
import { useApp } from "./app-provider"
import { useNetwork } from "./network-provider"
import { cn } from "@/lib/utils"

interface StatusHeaderProps {
  onOpenAccount: () => void
  isAccountActive?: boolean
}

export function StatusHeader({ onOpenAccount, isAccountActive = false }: StatusHeaderProps): JSX.Element {
  const { isPremium, currentTrip, checkInStatus, syncStatus, lastSyncedAt, isSyncing } = useApp()
  const { state: network } = useNetwork()
  const connectivityLabel = network.connectivity === "offline" ? "Offline" : network.connectivity
  const constrainedLabel = network.ultraConstrained ? "Ultra-constrained" : network.constrained ? "Constrained" : null

  const connectivityIcon = (() => {
    switch (network.connectivity) {
      case "wifi":
        return <Wifi className="w-4 h-4 text-safe" />
      case "cellular":
        return <RadioTower className="w-4 h-4 text-primary" />
      case "satellite":
        return <Satellite className="w-4 h-4 text-warning" />
      default:
        return <CloudOff className="w-4 h-4 text-offline" />
    }
  })()

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border safe-area-top">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Shield className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">Hunter Alert</span>
          </div>
          {isPremium && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-accent text-accent-foreground">PRO</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {currentTrip && (
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                checkInStatus === "ok" && "bg-safe/20 text-safe",
                checkInStatus === "pending" && "bg-warning/20 text-warning",
                checkInStatus === "overdue" && "bg-danger/20 text-danger animate-pulse",
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  checkInStatus === "ok" && "bg-safe",
                  checkInStatus === "pending" && "bg-warning",
                  checkInStatus === "overdue" && "bg-danger",
                )}
              />
              {checkInStatus === "ok" ? "Safe" : checkInStatus === "pending" ? "Check-in Due" : "Overdue"}
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground">
            {connectivityIcon}
            <span className="text-xs font-medium capitalize">{connectivityLabel}</span>
            {constrainedLabel && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-warning/20 text-warning font-semibold">
                {constrainedLabel}
              </span>
            )}
            {syncStatus && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {isSyncing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-3 h-3 text-safe" />
                )}
                <span className="font-medium">{syncStatus}</span>
                {lastSyncedAt && <span className="hidden sm:inline">• {new Date(lastSyncedAt).toLocaleTimeString()}</span>}
              </span>
            )}
            <button
              onClick={onOpenAccount}
              className={cn(
                "relative p-2 rounded-full transition-colors",
                isAccountActive ? "bg-muted text-primary" : "hover:bg-muted",
              )}
              aria-label="Profile and notifications"
            >
              <UserRound className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

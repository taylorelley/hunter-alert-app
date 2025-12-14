"use client"

import { Home, Map as MapIcon, Compass, Users, AlertTriangle, type LucideIcon } from "lucide-react"
import type { JSX } from "react"
import { useApp } from "./app-provider"
import { cn } from "@/lib/utils"

export type TabId = "home" | "map" | "trips" | "groups"

interface MobileNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  onSOSPress: () => void
}

interface TabConfig {
  id: TabId
  label: string
  icon: LucideIcon
}

export function MobileNav({ activeTab, onTabChange, onSOSPress }: MobileNavProps): JSX.Element {
  const { isOnline, sosActive } = useApp()

  const tabs: TabConfig[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "map", label: "Map", icon: MapIcon },
    { id: "trips", label: "Trips", icon: Compass },
    { id: "groups", label: "Groups", icon: Users },
  ]

  const leftTabs = tabs.slice(0, 2)
  const rightTabs = tabs.slice(2)

  const renderTab = (tab: TabConfig): JSX.Element => {
    const Icon = tab.icon
    const isActive = activeTab === tab.id

    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={cn(
          "flex flex-col items-center justify-center min-w-[56px] h-12 rounded-lg transition-colors",
          isActive ? "text-primary" : "text-muted-foreground",
        )}
        aria-label={tab.label}
        aria-current={isActive ? "page" : undefined}
      >
        <Icon className="w-5 h-5" />
        <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
      </button>
    )
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {leftTabs.map(renderTab)}

        <button
          onClick={onSOSPress}
          className={cn(
            "relative flex flex-col items-center justify-center w-16 h-16 -mt-6 rounded-full transition-all",
            sosActive ? "bg-danger animate-pulse" : "bg-danger hover:bg-danger/90 active:scale-95",
          )}
          aria-label="Emergency SOS"
        >
          <AlertTriangle className="w-6 h-6 text-danger-foreground" />
          <span className="text-[10px] font-semibold text-danger-foreground mt-0.5">Alert</span>
        </button>

        {rightTabs.map(renderTab)}
      </div>

      {!isOnline && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-offline text-offline-foreground text-xs font-medium flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-offline-foreground/60 animate-pulse" />
          Offline
        </div>
      )}
    </nav>
  )
}

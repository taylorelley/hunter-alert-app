"use client"

import { Home, Map, Compass, Users, User, AlertTriangle } from "lucide-react"
import { useApp } from "./app-provider"
import { cn } from "@/lib/utils"

interface MobileNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
  onSOSPress: () => void
}

export function MobileNav({ activeTab, onTabChange, onSOSPress }: MobileNavProps) {
  const { isOnline, sosActive } = useApp()

  const tabs = [
    { id: "home", label: "Home", icon: Home },
    { id: "map", label: "Map", icon: Map },
    { id: "trips", label: "Trips", icon: Compass },
    { id: "groups", label: "Groups", icon: Users },
    { id: "profile", label: "Profile", icon: User },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {tabs.map((tab, index) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          if (index === 2) {
            return (
              <div key="sos-wrapper" className="flex items-center gap-1">
                <button
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

                <button
                  onClick={onSOSPress}
                  className={cn(
                    "relative flex items-center justify-center w-14 h-14 -mt-6 rounded-full transition-all",
                    sosActive ? "bg-danger animate-pulse" : "bg-danger hover:bg-danger/90 active:scale-95",
                  )}
                  aria-label="Emergency SOS"
                >
                  <AlertTriangle className="w-6 h-6 text-danger-foreground" />
                  <span className="sr-only">Emergency SOS Button</span>
                </button>

                <button
                  onClick={() => onTabChange(tabs[index + 1].id)}
                  className={cn(
                    "flex flex-col items-center justify-center min-w-[56px] h-12 rounded-lg transition-colors",
                    activeTab === tabs[index + 1].id ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-label={tabs[index + 1].label}
                >
                  {(() => {
                    const NextIcon = tabs[index + 1].icon
                    return <NextIcon className="w-5 h-5" />
                  })()}
                  <span className="text-[10px] mt-0.5 font-medium">{tabs[index + 1].label}</span>
                </button>
              </div>
            )
          }

          if (index === 3) return null

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
        })}
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

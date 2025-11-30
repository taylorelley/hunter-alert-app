"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Capacitor } from "@capacitor/core"
import NetworkMonitor from "@/lib/capacitor/network-monitor"

export type NetworkConnectivity = "offline" | "wifi" | "cellular" | "satellite"

export interface NetworkState {
  connectivity: NetworkConnectivity
  constrained: boolean
  ultraConstrained: boolean
  expensive?: boolean
  lastUpdated: number
}

const DEFAULT_STATE: NetworkState = {
  connectivity: "offline",
  constrained: false,
  ultraConstrained: false,
  expensive: false,
  lastUpdated: Date.now(),
}

async function computeNetworkState(): Promise<NetworkState> {
  if (typeof window === "undefined") {
    return DEFAULT_STATE
  }

  // Use native Capacitor plugin on mobile platforms
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await NetworkMonitor.getStatus()
      return {
        ...status,
        lastUpdated: Date.now(),
      }
    } catch (error) {
      console.error("Failed to get network status from native plugin:", error)
      // Fall back to web implementation
    }
  }

  // Web fallback using browser APIs
  const connection = (navigator as any).connection
  const online = navigator.onLine
  const type = connection?.type as string | undefined
  const effective = connection?.effectiveType as string | undefined
  const saveData = Boolean(connection?.saveData)
  const constrained = saveData || ["2g", "slow-2g"].includes(effective || "")
  const ultraConstrained = Boolean(constrained && (effective === "slow-2g" || connection?.downlink < 0.5))

  let connectivity: NetworkConnectivity = "wifi"
  if (!online) {
    connectivity = "offline"
  } else if (type === "cellular") {
    connectivity = "cellular"
  } else if (type === "satellite") {
    connectivity = "satellite"
  }

  return {
    connectivity,
    constrained,
    ultraConstrained,
    expensive: constrained,
    lastUpdated: Date.now(),
  }
}

interface NetworkContextValue {
  state: NetworkState
  refresh: () => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState>(DEFAULT_STATE)
  const refreshRef = useRef<(() => void) | undefined>(undefined)

  const refresh = useCallback(() => {
    computeNetworkState().then(setState)
  }, [])

  refreshRef.current = refresh

  useEffect(() => {
    // Initial fetch
    refresh()

    // Set up native listeners if on mobile
    if (Capacitor.isNativePlatform()) {
      const listener = NetworkMonitor.addListener('networkStatusChange', (status) => {
        setState({
          ...status,
          lastUpdated: Date.now(),
        })
      })

      return () => {
        listener.then(l => l.remove())
      }
    }

    // Web fallback listeners
    const handleOnline = () => refreshRef.current?.()
    const connection = (navigator as any).connection

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOnline)
    connection?.addEventListener?.("change", handleOnline)

    const interval = window.setInterval(() => refreshRef.current?.(), 30000)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOnline)
      connection?.removeEventListener?.("change", handleOnline)
      window.clearInterval(interval)
    }
  }, [refresh])

  const value = useMemo(() => ({ state, refresh }), [state, refresh])

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    throw new Error("useNetwork must be used within a NetworkProvider")
  }
  return ctx
}

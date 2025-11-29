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

export type NetworkConnectivity = "offline" | "wifi" | "cellular" | "satellite"

export interface NetworkState {
  connectivity: NetworkConnectivity
  constrained: boolean
  ultraConstrained: boolean
  lastUpdated: number
}

const DEFAULT_STATE: NetworkState = {
  connectivity: "offline",
  constrained: false,
  ultraConstrained: false,
  lastUpdated: Date.now(),
}

function computeNetworkState(): NetworkState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE
  }

  const connection = (navigator as any).connection
  const online = navigator.onLine
  const type = connection?.type as string | undefined
  const effective = connection?.effectiveType as string | undefined
  const constrained = Boolean(connection?.saveData || ["2g", "slow-2g"].includes(effective || ""))
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
    lastUpdated: Date.now(),
  }
}

interface NetworkContextValue {
  state: NetworkState
  refresh: () => void
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkState>(() => computeNetworkState())
  const refresh = useCallback(() => setState(computeNetworkState()), [])
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const handleOnline = () => refreshRef.current()
    const connection = (navigator as any).connection

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOnline)
    connection?.addEventListener?.("change", handleOnline)

    const interval = window.setInterval(() => refreshRef.current(), 30000)

    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOnline)
      connection?.removeEventListener?.("change", handleOnline)
      window.clearInterval(interval)
    }
  }, [])

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

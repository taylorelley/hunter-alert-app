export interface NetworkInformationLike {
  type?: string
  effectiveType?: string
  saveData?: boolean
  downlink?: number
  addEventListener?: (event: string, listener: () => void) => void
  removeEventListener?: (event: string, listener: () => void) => void
}

export type NavigatorWithConnection = Navigator & { connection?: NetworkInformationLike }

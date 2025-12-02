import { Capacitor } from "@capacitor/core"
import { appConfig } from "@/lib/config/env"

export interface BillingPackage {
  id: string
  price: string
  period: string
  productId?: string
  identifier?: string
  description?: string
}

export interface BillingOffering {
  id: string
  title: string
  description?: string
  packages: BillingPackage[]
}

export interface BillingResult {
  entitlementActive: boolean
  receipt?: string
  productId?: string
  transactionIdentifier?: string
  raw?: unknown
}

type PurchasesLike = {
  configure?: (config: Record<string, unknown>) => Promise<void>
  getOfferings?: () => Promise<unknown>
  purchasePackage?: (params: Record<string, unknown>) => Promise<unknown>
  restorePurchases?: () => Promise<unknown>
  getCustomerInfo?: () => Promise<unknown>
}

type CustomerInfoLike = {
  entitlements?: {
    active?: Record<string, unknown>
    all?: Record<string, { isActive?: boolean; latestPurchaseDate?: string; originalPurchaseDate?: string }>
  }
  activeSubscriptions?: string[]
  latestPurchaseDate?: string
  originalPurchaseDate?: string
  managementURL?: string
}

type RevenueCatPackage = {
  identifier?: string
  packageType?: string
  product?: {
    identifier?: string
    price?: string
    priceString?: string
    subscriptionPeriod?: string
    description?: string
  }
}

type RevenueCatOffering = {
  availablePackages?: RevenueCatPackage[]
  serverDescription?: string
  description?: string
  metadata?: { tagline?: string }
}

type RevenueCatOfferings = {
  all?: Record<string, RevenueCatOffering>
}

let purchasesPromise: Promise<PurchasesLike | null> | null = null

function resolveEntitlementActive(customerInfo: unknown, entitlementId: string): boolean {
  if (!customerInfo || typeof customerInfo !== "object") return false
  const info = customerInfo as CustomerInfoLike
  const activeMap = info.entitlements?.active ?? {}
  const allMap = info.entitlements?.all ?? {}
  if (activeMap && typeof activeMap === "object" && entitlementId in activeMap) return true
  if (allMap && typeof allMap === "object" && allMap[entitlementId]?.isActive) return true
  const activeSubs = info.activeSubscriptions as string[] | undefined
  if (Array.isArray(activeSubs) && activeSubs.includes(entitlementId)) return true
  return false
}

function extractPackages(rawOfferings: unknown): BillingOffering[] {
  const offeringsPayload = rawOfferings as RevenueCatOfferings
  if (!offeringsPayload?.all) return []
  const offerings: BillingOffering[] = []
  for (const [offeringId, offering] of Object.entries(offeringsPayload.all)) {
    const availablePackages: RevenueCatPackage[] = Array.isArray(offering.availablePackages)
      ? offering.availablePackages
      : []
    offerings.push({
      id: offeringId,
      title: offering.serverDescription || offering.description || offeringId,
      description: offering.metadata?.tagline,
      packages: availablePackages.map((pkg) => ({
        id: pkg.identifier || pkg.packageType || pkg.product?.identifier || offeringId,
        identifier: pkg.identifier || pkg.packageType,
        price: pkg.product?.priceString || pkg.product?.price || "",
        period: pkg.packageType || pkg.product?.subscriptionPeriod || "subscription",
        productId: pkg.product?.identifier,
        description: pkg.product?.description,
      })),
    })
  }
  return offerings
}

function fallbackOfferings(): BillingOffering[] {
  return [
    {
      id: "pro",
      title: "Pro Subscription",
      description: "Unlock faster check-ins and longer history",
      packages: [
        { id: "pro_monthly", price: "$4.99", period: "Monthly" },
        { id: "pro_annual", price: "$39.99", period: "Annual", description: "Save 30%" },
      ],
    },
  ]
}

async function loadPurchases(userId?: string): Promise<PurchasesLike | null> {
  if (!appConfig.billing.revenueCatApiKey) {
    return null
  }

  if (!purchasesPromise) {
    purchasesPromise = import("@revenuecat/purchases-capacitor")
      .then((module) => {
        const typedModule = module as typeof import("@revenuecat/purchases-capacitor")
        const candidate =
          typedModule.Purchases ||
          (module as unknown as { default?: { Purchases?: PurchasesLike } }).default?.Purchases
        return (candidate ?? null) as unknown as PurchasesLike | null
      })
      .then(async (purchases) => {
        if (!purchases) return null
        if (typeof purchases.configure === "function") {
          await purchases.configure({
            apiKey: appConfig.billing.revenueCatApiKey,
            appUserID: userId,
          })
        }
        return purchases as PurchasesLike
      })
      .catch((error) => {
        console.error("Failed to load RevenueCat purchases", error)
        return null
      })
  }

  const purchases = await purchasesPromise
  if (!purchases) return null

  if (Capacitor.isNativePlatform() && typeof purchases.configure === "function") {
    await purchases.configure({
      apiKey: appConfig.billing.revenueCatApiKey,
      appUserID: userId,
      observerMode: false,
    })
  }

  return purchases
}

export async function getOfferings(userId?: string): Promise<BillingOffering[]> {
  const purchases = await loadPurchases(userId)
  if (purchases?.getOfferings) {
    try {
      const offerings = await purchases.getOfferings()
      const mapped = extractPackages(offerings)
      if (mapped.length) return mapped
    } catch (error) {
      console.warn("Unable to fetch offerings from purchases", error)
    }
  }
  return fallbackOfferings()
}

function normalizeReceipt(customerInfo: unknown): string | undefined {
  if (!customerInfo || typeof customerInfo !== "object") return undefined
  const info = customerInfo as CustomerInfoLike
  const entitlements = info.entitlements?.all ?? {}
  const entitlementId = appConfig.billing.entitlementId
  const entitlement = entitlementId ? entitlements[entitlementId] : undefined
  return (
    entitlement?.latestPurchaseDate ||
    entitlement?.originalPurchaseDate ||
    info.latestPurchaseDate ||
    info.originalPurchaseDate ||
    info.managementURL ||
    undefined
  )
}

export async function purchasePackage(
  packageId: string,
  offeringId?: string,
  userId?: string,
): Promise<BillingResult> {
  const purchases = await loadPurchases(userId)
  if (!purchases?.purchasePackage) {
    console.warn("Purchases client unavailable; skipping purchase attempt")
    return {
      entitlementActive: false,
      productId: packageId,
    }
  }

  try {
    const result = (await purchases.purchasePackage({
      packageIdentifier: packageId,
      offeringIdentifier: offeringId || appConfig.billing.offeringId,
    })) as {
      customerInfo?: CustomerInfoLike
      productIdentifier?: string
      transactionIdentifier?: string
    }
    const customerInfo = result.customerInfo ?? result
    return {
      entitlementActive: resolveEntitlementActive(customerInfo, appConfig.billing.entitlementId),
      receipt: normalizeReceipt(customerInfo),
      productId: result.productIdentifier || packageId,
      transactionIdentifier: result.transactionIdentifier,
      raw: result,
    }
  } catch (error) {
    console.error("Failed to purchase package", error)
    return {
      entitlementActive: false,
      productId: packageId,
    }
  }
}

export async function restorePurchases(userId?: string): Promise<BillingResult> {
  const purchases = await loadPurchases(userId)
  if (!purchases?.restorePurchases) {
    console.warn("Purchases client unavailable; cannot restore purchases")
    return {
      entitlementActive: false,
    }
  }

  try {
    const info = (await purchases.restorePurchases()) as CustomerInfoLike
    return {
      entitlementActive: resolveEntitlementActive(info, appConfig.billing.entitlementId),
      receipt: normalizeReceipt(info),
      raw: info,
    }
  } catch (error) {
    console.error("Failed to restore purchases", error)
    return {
      entitlementActive: false,
    }
  }
}

export async function getCustomerInfo(userId?: string): Promise<BillingResult | null> {
  const purchases = await loadPurchases(userId)
  if (!purchases?.getCustomerInfo) {
    console.warn("Purchases client unavailable; cannot load customer info")
    return { entitlementActive: false }
  }

  try {
    const info = (await purchases.getCustomerInfo()) as CustomerInfoLike
    return {
      entitlementActive: resolveEntitlementActive(info, appConfig.billing.entitlementId),
      receipt: normalizeReceipt(info),
      raw: info,
    }
  } catch (error) {
    console.error("Failed to fetch customer info", error)
    return { entitlementActive: false }
  }
}

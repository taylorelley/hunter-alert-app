"use client"

import { useEffect, useMemo, useState } from "react"
import { CreditCard, RefreshCw, ShieldCheck, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useApp } from "./app-provider"

interface BillingSettingsProps {
  title?: string
  compact?: boolean
}

export function BillingSettings({ title = "Billing", compact = false }: BillingSettingsProps) {
  const {
    isPremium,
    billingOfferings,
    billingError,
    billingLoading,
    billingReceipt,
    purchasePremium,
    restorePremium,
    session,
  } = useApp()
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)

  const isSignedIn = useMemo(() => Boolean(session), [session])

  const primaryOffering = useMemo(() => billingOfferings[0], [billingOfferings])

  useEffect(() => {
    if (!selectedPackage && primaryOffering?.packages?.length) {
      setSelectedPackage(primaryOffering.packages[0].id)
    }
  }, [primaryOffering, selectedPackage])

  const selectedLabel = useMemo(() => {
    const pkg = primaryOffering?.packages.find((p) => p.id === selectedPackage)
    return pkg ? `${pkg.price} · ${pkg.period}` : "Choose a plan"
  }, [primaryOffering?.packages, selectedPackage])

  return (
    <Card className={compact ? "bg-card/80" : "border-accent/30 bg-gradient-to-br from-accent/5 to-transparent"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            {title}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Restore purchases, manage Pro, and review receipts.</p>
        </div>
        {isPremium && <Badge variant="outline">Pro active</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Plan</span>
            <span className="text-muted-foreground">{selectedLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {primaryOffering?.packages.map((pkg) => (
              <Button
                key={pkg.id}
                variant={selectedPackage === pkg.id ? "default" : "outline"}
                className="w-full justify-between"
                onClick={() => setSelectedPackage(pkg.id)}
                disabled={billingLoading}
              >
                <div className="flex flex-col text-left">
                  <span className="font-semibold">{pkg.period}</span>
                  <span className="text-xs text-muted-foreground">{pkg.price}</span>
                </div>
                {pkg.description && <Badge variant="secondary">{pkg.description}</Badge>}
              </Button>
            )) || (
              <p className="text-sm text-muted-foreground">Purchase options will load once you sign in.</p>
            )}
          </div>
        </div>

        {!isSignedIn && (
          <p className="text-xs text-muted-foreground">Sign in to purchase or restore your subscription.</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            className="flex-1"
            onClick={() => purchasePremium(selectedPackage ?? undefined, primaryOffering?.id)}
            disabled={billingLoading || !primaryOffering || !isSignedIn}
          >
            <Zap className="w-4 h-4 mr-2" />
            {billingLoading ? "Processing..." : isPremium ? "Manage Pro" : "Upgrade to Pro"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={restorePremium}
            disabled={billingLoading || !isSignedIn}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Restore
          </Button>
        </div>

        <Separator />

        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="w-4 h-4" />
            <span>Receipts and subscription status sync to your Supabase profile.</span>
          </div>
          {billingReceipt && <p className="text-xs text-muted-foreground">Last receipt: {billingReceipt}</p>}
          {billingError && <p className="text-xs text-danger">{billingError}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

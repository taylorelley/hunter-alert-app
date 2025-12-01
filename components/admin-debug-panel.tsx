"use client"

import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { appConfig, missingRequiredEnv } from "@/lib/config/env"

const SETTINGS = [
  {
    label: "send_message_batch max",
    setting: appConfig.constraints.backendMaxMessageBatch,
    note: "Backend RPC guard for constrained payloads.",
  },
  {
    label: "pull_updates row cap",
    setting: appConfig.constraints.backendMaxPullLimit,
    note: "Rows per entity returned during sync pulls.",
  },
  {
    label: "Normal network batch",
    setting: appConfig.constraints.syncNormalBatchLimit,
    note: "Messages flushed when Wi-Fi or unconstrained.",
  },
  {
    label: "Satellite/constrained batch",
    setting: appConfig.constraints.syncSatelliteBatchLimit,
    note: "Messages flushed when constrained or satellite.",
  },
  {
    label: "Ultra-constrained batch",
    setting: appConfig.constraints.syncUltraBatchLimit,
    note: "Messages flushed when ultra-constrained is detected.",
  },
  {
    label: "Base sync backoff (ms)",
    setting: appConfig.constraints.syncBaseBackoffMs,
    note: "Backoff seed used before applying network multipliers.",
  },
]

export function AdminDebugPanel(): JSX.Element {
  const missing = missingRequiredEnv
  const statusIcon = missing.length === 0 ? (
    <CheckCircle2 className="w-4 h-4 text-safe" aria-hidden />
  ) : (
    <AlertTriangle className="w-4 h-4 text-warning" aria-hidden />
  )

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" />
            Admin / Debug
          </CardTitle>
          <CardDescription>
            Effective constrained-network limits loaded at startup.
          </CardDescription>
        </div>
        {statusIcon}
      </CardHeader>
      <CardContent className="space-y-3">
        {missing.length > 0 ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground">
            Missing required env vars: {missing.join(", ")}
          </div>
        ) : (
          <div className="rounded-lg border border-safe/40 bg-safe/10 p-3 text-sm text-safe-foreground">
            Supabase connectivity variables are present.
          </div>
        )}

        <div className="grid gap-3">
          {SETTINGS.map(({ label, setting, note }) => (
            <div
              key={setting.key}
              className="flex items-start justify-between rounded-lg border border-border bg-card/60 p-3"
            >
              <div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{note}</p>
                <p className="text-[11px] text-muted-foreground">
                  Range {setting.min}-{setting.max} • Default {setting.defaultValue}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold">{setting.value}</p>
                <p className="text-xs text-muted-foreground capitalize">Source: {setting.source}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Supabase Edge Function: dispatch-alerts
// Sends SMS alerts for check-ins or SOS events based on verified user preferences.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

interface AlertPayload {
  type: "checkin" | "sos"
  message: string
  tripId?: string | null
  checkInId?: string | null
  location?: { lat?: number; lng?: number; accuracy?: number }
}

const FETCH_TIMEOUT_MS = 10_000

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER")
const NODE_ENV = Deno.env.get("NODE_ENV") ?? "production"

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase environment variables are missing; auth will fail")
}

async function sendSms(to: string, body: string): Promise<{ ok: boolean; status: number; message: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    const simulatedMessage = "Simulated SMS - credentials missing"
    const logMethod = NODE_ENV === "development" ? console.warn : console.error
    logMethod(`SIMULATED SMS to ${redactPhone(to)}: ${simulatedMessage}`)

    if (NODE_ENV === "development") {
      return { ok: true, status: 202, message: simulatedMessage }
    }

    return { ok: false, status: 503, message: simulatedMessage }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: body,
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const text = await response.text()
    return { ok: response.ok, status: response.status, message: text }
  } catch (error) {
    clearTimeout(timeoutId)
    console.error("SMS send failed", error)
    const message = error instanceof Error ? error.message : "Failed to send SMS"
    return { ok: false, status: 500, message }
  }
}

function redactPhone(phone?: string | null) {
  if (!phone) return "***"
  const visible = phone.slice(-4)
  return `***${visible}`
}

function buildMessage(payload: AlertPayload) {
  const header = payload.type === "sos" ? "SOS alert" : "Check-in"
  const details: string[] = [`${header}: ${payload.message}`]
  if (payload.location?.lat && payload.location?.lng) {
    details.push(
      `Location: ${payload.location.lat.toFixed(5)}, ${payload.location.lng.toFixed(5)}${
        payload.location.accuracy ? ` (±${payload.location.accuracy}m)` : ""
      }`,
    )
  }
  if (payload.tripId) {
    details.push(`Trip: ${payload.tripId}`)
  }
  if (payload.checkInId) {
    details.push(`Check-in: ${payload.checkInId}`)
  }
  return details.join("\n")
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Server not configured", { status: 500 })
  }

  let payload: AlertPayload
  try {
    payload = (await req.json()) as AlertPayload
  } catch (error) {
    console.error("Invalid JSON payload", error)
    return new Response("Invalid JSON", { status: 400 })
  }

  if (!payload || !payload.type || !payload.message) {
    return new Response("Missing alert payload", { status: 400 })
  }

  if (payload.message.length > 1600) {
    return new Response("Message too long", { status: 400 })
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  })

  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError || !authData?.user) {
    console.warn("Unauthorized alert dispatch", authError)
    return new Response("Unauthorized", { status: 401 })
  }

  const { data: subscription, error } = await client
    .from("sms_alert_subscriptions")
    .select("phone, status, allow_checkins, allow_sos")
    .eq("user_id", authData.user.id)
    .maybeSingle()

  if (error) {
    console.error("Failed to load SMS preferences", error)
    return new Response("Unable to load SMS preferences", { status: 500 })
  }

  if (!subscription) {
    return new Response("SMS alerts not configured", { status: 400 })
  }

  if (subscription.status !== "verified") {
    return new Response("Phone number not verified", { status: 403 })
  }

  if (payload.type === "checkin" && subscription.allow_checkins === false) {
    return new Response("Check-in alerts disabled", { status: 409 })
  }

  if (payload.type === "sos" && subscription.allow_sos === false) {
    return new Response("SOS alerts disabled", { status: 409 })
  }

  const body = buildMessage(payload)
  const smsResult = await sendSms(subscription.phone, body)

  if (!smsResult.ok) {
    return new Response(JSON.stringify({ delivered: false, message: smsResult.message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    })
  }

  const { error: updateError } = await client
    .from("sms_alert_subscriptions")
    .update({ last_dispatched_at: new Date().toISOString() })
    .eq("user_id", authData.user.id)

  if (updateError) {
    console.error("Failed to update last_dispatched_at", updateError)
  }

  return new Response(
    JSON.stringify({
      delivered: true,
      phone: redactPhone(subscription.phone),
      message: smsResult.message,
      warning: updateError ? "Failed to record dispatch timestamp" : undefined,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
})

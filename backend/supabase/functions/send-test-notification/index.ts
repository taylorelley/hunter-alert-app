// Supabase Edge Function: send-test-notification
// Sends a test SMS or email to an emergency contact using Twilio/Postmark style providers.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"

interface ContactPayload {
  id?: string
  name: string
  phone?: string
  email?: string
  relationship?: string
}

interface RequestPayload {
  contact: ContactPayload
  channel?: "sms" | "email"
}

const redactPhone = (phone?: string) => {
  if (!phone) return undefined
  const visible = phone.slice(-4)
  return `***${visible}`
}

const redactEmail = (email?: string) => {
  if (!email) return undefined
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const redactedLocal = local.length > 1 ? `${local[0]}***` : "***"
  return `${redactedLocal}@${domain}`
}

const FETCH_TIMEOUT_MS = 10_000

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")
const TWILIO_FROM_NUMBER = Deno.env.get("TWILIO_FROM_NUMBER")
const POSTMARK_TOKEN = Deno.env.get("POSTMARK_SERVER_TOKEN")
const POSTMARK_FROM = Deno.env.get("POSTMARK_FROM")

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("Supabase environment variables are missing; auth will fail")
}

async function sendSms(contact: ContactPayload, body: string): Promise<{ ok: boolean; status: number; message: string }> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    console.log("Twilio credentials missing; simulating SMS send")
    return { ok: true, status: 202, message: "Simulated SMS delivery" }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    To: contact.phone ?? "",
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

async function sendEmail(contact: ContactPayload, subject: string, body: string): Promise<{ ok: boolean; status: number; message: string }> {
  if (!POSTMARK_TOKEN || !POSTMARK_FROM) {
    console.log("Postmark credentials missing; simulating email send")
    return { ok: true, status: 202, message: "Simulated email delivery" }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": POSTMARK_TOKEN,
      },
      body: JSON.stringify({
        From: POSTMARK_FROM,
        To: contact.email,
        Subject: subject,
        TextBody: body,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const text = await response.text()
    return { ok: response.ok, status: response.status, message: text }
  } catch (error) {
    clearTimeout(timeoutId)
    console.error("Email send failed", error)
    const message = error instanceof Error ? error.message : "Failed to send email"
    return { ok: false, status: 500, message }
  }
}

serve(async (req): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  let payload: RequestPayload
  try {
    payload = (await req.json()) as RequestPayload
  } catch (error) {
    console.error("Unable to parse request", error)
    return new Response("Invalid JSON payload", { status: 400 })
  }

  const contact = payload?.contact
  if (!contact || !contact.name || (!contact.phone && !contact.email)) {
    return new Response("Contact must include a name and phone or email", { status: 400 })
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Server not configured", { status: 500 })
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
  })

  const {
    data: { user },
    error,
  } = await client.auth.getUser()

  if (error || !user) {
    console.error("Auth failed for test notification", error)
    return new Response("Unauthorized", { status: 401 })
  }

  const normalizedChannel =
    typeof payload.channel === "string" && payload.channel.trim()
      ? payload.channel.trim().toLowerCase()
      : undefined
  const channel: "sms" | "email" = normalizedChannel === "sms" || normalizedChannel === "email"
    ? normalizedChannel
    : contact.phone
      ? "sms"
      : "email"
  const attempts: Array<{ via: string; status: number; ok: boolean; message: string }> = []
  const message = `Hunter Alert test notification for ${contact.name}. Triggered by ${user.email ?? user.id}.`

  let deliveredVia: string | null = null

  if (channel === "sms") {
    if (contact.phone) {
      const smsResult = await sendSms(contact, message)
      attempts.push({ via: "sms", status: smsResult.status, ok: smsResult.ok, message: smsResult.message })
      if (smsResult.ok) {
        deliveredVia = "sms"
      }
    } else {
      const message = "Requested SMS channel but contact has no phone number"
      const logMetadata: Record<string, string> = { contactName: contact.name }
      if (contact.id) {
        logMetadata.contactId = contact.id
      }
      console.warn(message, logMetadata)
      attempts.push({ via: "sms", status: 400, ok: false, message })
    }
  }

  if (!deliveredVia && contact.email) {
    const emailResult = await sendEmail(contact, "Hunter Alert test", message)
    attempts.push({ via: "email", status: emailResult.status, ok: emailResult.ok, message: emailResult.message })
    if (emailResult.ok) {
      deliveredVia = "email"
    }
  }

  const contactResponse: Record<string, unknown> = {
    name: contact.name,
    phone: redactPhone(contact.phone),
    email: redactEmail(contact.email),
    emailProvided: Boolean(contact.email),
  }

  if (contact.id) {
    contactResponse.id = contact.id
  }

  return new Response(
    JSON.stringify({
      deliveredVia,
      attempted: attempts,
      contact: contactResponse,
      channel,
    }),
    {
      status: deliveredVia ? 200 : 202,
      headers: { "Content-Type": "application/json" },
    },
  )
})

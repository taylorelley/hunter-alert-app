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

async function sendSms(contact: ContactPayload, body: string) {
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  })

  const text = await response.text()
  return { ok: response.ok, status: response.status, message: text }
}

async function sendEmail(contact: ContactPayload, subject: string, body: string) {
  if (!POSTMARK_TOKEN || !POSTMARK_FROM) {
    console.log("Postmark credentials missing; simulating email send")
    return { ok: true, status: 202, message: "Simulated email delivery" }
  }

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
  })

  const text = await response.text()
  return { ok: response.ok, status: response.status, message: text }
}

serve(async (req) => {
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

  const channel: "sms" | "email" = payload.channel ?? (contact.phone ? "sms" : "email")
  const attempts: Array<{ via: string; status: number; ok: boolean; message: string }> = []
  const message = `Hunter Alert test notification for ${contact.name}. Triggered by ${user.email ?? user.id}.`

  let deliveredVia: string | null = null

  if (channel === "sms" && contact.phone) {
    const smsResult = await sendSms(contact, message)
    attempts.push({ via: "sms", status: smsResult.status, ok: smsResult.ok, message: smsResult.message })
    if (smsResult.ok) {
      deliveredVia = "sms"
    }
  }

  if (!deliveredVia && contact.email) {
    const emailResult = await sendEmail(contact, "Hunter Alert test", message)
    attempts.push({ via: "email", status: emailResult.status, ok: emailResult.ok, message: emailResult.message })
    if (emailResult.ok) {
      deliveredVia = "email"
    }
  }

  return new Response(
    JSON.stringify({
      deliveredVia,
      attempted: attempts,
      contact: { name: contact.name, phone: contact.phone, email: contact.email },
      channel,
    }),
    {
      status: deliveredVia ? 200 : 202,
      headers: { "Content-Type": "application/json" },
    },
  )
})

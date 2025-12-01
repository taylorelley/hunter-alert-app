"use client"

import { type FormEvent, useState } from "react"
import { Mail, Lock, ShieldCheck, LogIn, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useApp } from "./app-provider"
import { useNetwork } from "./network-provider"

export function AuthView() {
  const { signIn, signUp } = useApp()
  const { state: network } = useNetwork()
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setLoading(true)

    try {
      if (mode === "login") {
        await signIn(email, password)
      } else {
        await signUp({ email, password, displayName: displayName.trim() || undefined })
        setMessage("Account created. Check your email for verification if required.")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to authenticate"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>Hunter Alert</span>
          </div>
          <h1 className="text-2xl font-bold">Stay connected even off-grid</h1>
          <p className="text-muted-foreground text-sm">
            Sign in or create an account to sync trips, messages, and premium purchases.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mode === "login" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("login")}
                  className="gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  Log in
                </Button>
                <Button
                  type="button"
                  variant={mode === "signup" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setMode("signup")}
                  className="gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Sign up
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Network: {network.connectivity}
              </div>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-input focus-within:border-primary">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              {mode === "signup" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="displayName">
                    Display name
                  </label>
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Backcountry Scout"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-input text-sm focus:border-primary"
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="password">
                  Password
                </label>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-input focus-within:border-primary">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
              {message && <p className="text-sm text-safe">{message}</p>}

              <Button type="submit" className="w-full" disabled={loading || !email || !password}>
                {loading ? "Processing..." : mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to store your profile and trip data securely in Supabase.
        </p>
      </div>
    </div>
  )
}

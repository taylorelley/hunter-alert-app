import { Capacitor } from "@capacitor/core"
import { PushNotifications, type Token } from "@capacitor/push-notifications"

export interface PushRegistrationResult {
  token: string
  platform: string
  environment: "production" | "development"
}

function resolvePlatform(): string {
  const platform = Capacitor.getPlatform()
  return platform || "unknown"
}

export async function requestPushRegistration(): Promise<PushRegistrationResult> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Push notifications are only available on a native build")
  }

  try {
    const permission = await PushNotifications.checkPermissions()
    if (permission.receive !== "granted") {
      const request = await PushNotifications.requestPermissions()
      if (request.receive !== "granted") {
        throw new Error("Push notifications are not permitted")
      }
    }
  } catch (error) {
    console.error("Push permission check failed", error)
    throw new Error("Unable to check push notification permissions")
  }

  return new Promise<PushRegistrationResult>((resolve, reject) => {
    const cleanup = async () => {
      await PushNotifications.removeAllListeners()
    }

    const handleRegistration = async (token: Token) => {
      await cleanup()
      resolve({
        token: token.value,
        platform: resolvePlatform(),
        environment: process.env.NODE_ENV === "development" ? "development" : "production",
      })
    }

    const handleError = async (error: unknown) => {
      console.error("Push registration failed", error)
      await cleanup()
      reject(new Error("Unable to register for push notifications"))
    }

    PushNotifications.addListener("registration", handleRegistration)
    PushNotifications.addListener("registrationError", handleError)
    PushNotifications.register().catch(handleError)
  })
}

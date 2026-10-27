import { account, session, twoFactor, user, verification } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { eq } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"

import { ALLOWED_SSO_EMAIL_DOMAIN, parseAdminEmails } from "./admin-emails"
import {
  assertActiveStaffForSession,
  mapGoogleProfileToUser,
  prepareBootstrapAdminUser,
} from "./auth-gates"
import {
  SESSION_IDLE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  clampSessionExpiresAt,
} from "./session-policy"
import { createTwoFactorPlugin } from "./two-factor-config"
import { twoFactorAfterHook, twoFactorBeforeHook } from "./two-factor-hooks"

const authSchema = {
  user,
  session,
  account,
  verification,
  twoFactor,
}

export type EmailHubAuth = ReturnType<typeof createAuth>

let authInstance: EmailHubAuth | undefined

function publicAuthUrlIsHttps(): boolean {
  const base = process.env.BETTER_AUTH_URL?.trim() ?? ""
  return /^https:/i.test(base)
}

function createAuth() {
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)
  const secureCookies =
    process.env.NODE_ENV === "production" || publicAuthUrlIsHttps()

  return betterAuth({
    appName: "EmailHub",
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: false,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        requireEmailVerification: true,
        hd: ALLOWED_SSO_EMAIL_DOMAIN,
        mapProfileToUser: mapGoogleProfileToUser,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "viewer",
          input: false,
        },
        status: {
          type: "string",
          required: true,
          defaultValue: "active",
          input: false,
        },
      },
    },
    session: {
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
      cookieCache: {
        enabled: false,
      },
    },
    advanced: {
      useSecureCookies: secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: secureCookies,
      },
      database: {
        generateId: () => uuidv7(),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) =>
            prepareBootstrapAdminUser(newUser, adminEmails),
        },
      },
      session: {
        create: {
          before: async (newSession) => {
            const [row] = await getDb()
              .select({ status: user.status, email: user.email })
              .from(user)
              .where(eq(user.id, newSession.userId))
              .limit(1)
            assertActiveStaffForSession(row)
            const createdAt = new Date(newSession.createdAt ?? Date.now())
            const proposed = new Date(
              newSession.expiresAt ?? Date.now() + SESSION_IDLE_SECONDS * 1000
            )
            return {
              data: {
                ...newSession,
                expiresAt: clampSessionExpiresAt(createdAt, proposed),
              },
            }
          },
        },
        update: {
          before: async (session) => {
            if (!session.createdAt) {
              return
            }
            const createdAt = new Date(session.createdAt)
            const proposed = new Date(
              session.expiresAt ?? Date.now() + SESSION_IDLE_SECONDS * 1000
            )
            return {
              data: {
                expiresAt: clampSessionExpiresAt(createdAt, proposed),
              },
            }
          },
        },
      },
    },
    hooks: {
      before: twoFactorBeforeHook,
      after: twoFactorAfterHook,
    },
    plugins: [createTwoFactorPlugin(), nextCookies()],
  })
}

export function getAuth(): EmailHubAuth {
  if (!authInstance) {
    authInstance = createAuth()
  }
  return authInstance
}

export function resetAuthForTests(): void {
  authInstance = undefined
}

import { account, session, twoFactor, user, verification } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { normaliseEmail } from "@workspace/shared"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { twoFactor as twoFactorPlugin } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"

import {
  ALLOWED_SSO_EMAIL_DOMAIN,
  isAllowedSsoEmailDomain,
  isBootstrapAdminEmail,
  parseAdminEmails,
} from "./admin-emails"
import {
  SESSION_IDLE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
} from "./session-policy"

const authSchema = {
  user,
  session,
  account,
  verification,
  twoFactor,
}

export type EmailHubAuth = ReturnType<typeof createAuth>

let authInstance: EmailHubAuth | undefined

function createAuth() {
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS)

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
        scopes: ["openid", "email", "profile"],
        requireEmailVerification: true,
        // Prefer Workspace accounts in the Google account picker.
        hd: ALLOWED_SSO_EMAIL_DOMAIN,
        mapProfileToUser: (profile) => {
          if (profile.email_verified === false) {
            throw new APIError("FORBIDDEN", {
              message: "Unable to sign in",
            })
          }
          const email = normaliseEmail(String(profile.email ?? ""))
          if (!isAllowedSsoEmailDomain(email)) {
            throw new APIError("FORBIDDEN", {
              message: "Unable to sign in",
            })
          }
          return {
            email,
            name: String(profile.name ?? ""),
            image: profile.picture ? String(profile.picture) : undefined,
            emailVerified: true,
          }
        },
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
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
      database: {
        generateId: () => uuidv7(),
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            const email = normaliseEmail(newUser.email)
            if (
              !isAllowedSsoEmailDomain(email) ||
              !isBootstrapAdminEmail(email, adminEmails)
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Unable to sign in",
              })
            }
            return {
              data: {
                ...newUser,
                email,
                role: "admin",
                status: "active",
                emailVerified: true,
              },
            }
          },
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
            if (
              !row ||
              row.status !== "active" ||
              !isAllowedSsoEmailDomain(row.email)
            ) {
              throw new APIError("FORBIDDEN", {
                message: "Unable to sign in",
              })
            }
            return { data: newSession }
          },
        },
      },
    },
    plugins: [twoFactorPlugin(), nextCookies()],
  })
}

/** Lazy Better Auth instance (needs DATABASE_URL / secrets at first use). */
export function getAuth(): EmailHubAuth {
  if (!authInstance) {
    authInstance = createAuth()
  }
  return authInstance
}

/** Test helper — reset the singleton between cases. */
export function resetAuthForTests(): void {
  authInstance = undefined
}

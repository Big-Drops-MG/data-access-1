import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { twoFactor } from "better-auth/plugins"
import { v7 as uuidv7 } from "uuid"

import * as schema from "./src/schema/index.ts"

/**
 * CLI / schema reference config. Runtime auth lives in
 * `apps/email-hub/src/lib/auth/server.ts` (Google SSO, ADMIN_EMAILS, sessions, 2FA).
 */
export const auth = betterAuth({
  database: drizzleAdapter({} as never, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: false,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      scopes: ["openid", "email", "profile"],
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        input: false,
      },
      status: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 2,
    updateAge: 60 * 5,
  },
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  plugins: [
    twoFactor({
      issuer: "EmailHub",
      allowPasswordless: true,
      totpOptions: { digits: 6, period: 30 },
      backupCodeOptions: { amount: 10, storeBackupCodes: "encrypted" },
      accountLockout: { enabled: false },
      twoFactorCookieMaxAge: 600,
      trustDeviceMaxAge: 30 * 24 * 60 * 60,
    }),
  ],
})

import { createAuthClient } from "better-auth/react"
import { twoFactorClient } from "better-auth/client/plugins"

/** Browser Better Auth client (Google SSO, 2FA, sign-out). */
export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      twoFactorPage: "/login/2fa-verify",
    }),
  ],
})

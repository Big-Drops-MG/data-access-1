import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { twoFactor } from "better-auth/plugins"
import { v7 as uuidv7 } from "uuid"

import * as schema from "./src/schema/index.ts"

export const auth = betterAuth({
  database: drizzleAdapter({} as never, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
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
  advanced: {
    database: {
      generateId: () => uuidv7(),
    },
  },
  plugins: [twoFactor()],
})

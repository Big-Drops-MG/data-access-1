import { describe, expect, it } from "vitest"

import type { AppError } from "./errors.js"
import { triggerEmail } from "./trigger-email.js"
import type { EmailHubDb } from "./trigger-email.js"

describe("triggerEmail validation", () => {
  it("rejects an empty idempotency key before touching the database", async () => {
    const db = {
      transaction: async () => {
        throw new Error("should not open a transaction")
      },
    } as unknown as EmailHubDb

    await expect(
      triggerEmail(
        db,
        { email: "a@example.com", idempotencyKey: "   " },
        async () => {
          throw new Error("should not create")
        }
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
    } satisfies Partial<AppError>)
  })
})

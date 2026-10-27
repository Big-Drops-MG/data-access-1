import { describe, expect, it } from "vitest"

import { resolveTwoFactorVerifyError } from "./verify-error"

describe("resolveTwoFactorVerifyError", () => {
  it("maps temporary lockout", () => {
    expect(
      resolveTwoFactorVerifyError({
        code: "ACCOUNT_TEMPORARILY_LOCKED",
        lockedUntil: "2026-10-26T12:00:00.000Z",
      })
    ).toMatchObject({
      kind: "temporary_lock",
      title: "Too many wrong codes",
      lockedUntil: "2026-10-26T12:00:00.000Z",
    })
  })

  it("maps admin reset", () => {
    expect(
      resolveTwoFactorVerifyError({ code: "TWO_FACTOR_ADMIN_RESET_REQUIRED" })
    ).toMatchObject({ kind: "admin_required" })
  })

  it("maps invalid codes", () => {
    expect(resolveTwoFactorVerifyError({ code: "INVALID_CODE" })).toMatchObject(
      { kind: "invalid" }
    )
  })
})

import { describe, expect, it } from "vitest"

import { AppError } from "@workspace/shared"

import { parseOrThrow } from "@/lib/zod-parse"

import { inviteUserBodySchema, updateUserRoleBodySchema } from "./schemas"

describe("user request schemas", () => {
  it("accepts a normalised workspace email and role", () => {
    expect(
      parseOrThrow(inviteUserBodySchema, {
        email: " Ada@BigDropsMarketing.com ",
        role: "operator",
      })
    ).toEqual({
      email: "ada@bigdropsmarketing.com",
      role: "operator",
    })
  })

  it("rejects an invalid email, off-domain email, or role", () => {
    expect(() =>
      parseOrThrow(inviteUserBodySchema, {
        email: "not-an-email",
        role: "operator",
      })
    ).toThrow(AppError)
    expect(() =>
      parseOrThrow(inviteUserBodySchema, {
        email: "ada@gmail.com",
        role: "operator",
      })
    ).toThrow(
      expect.objectContaining({
        code: "validation_failed",
        status: 422,
        details: [
          {
            path: "email",
            message: "Must be a bigdropsmarketing.com address",
          },
        ],
      })
    )
    expect(() =>
      parseOrThrow(inviteUserBodySchema, {
        email: "ada@bigdropsmarketing.com",
        role: "owner",
      })
    ).toThrow(AppError)
    expect(() =>
      parseOrThrow(updateUserRoleBodySchema, { role: "owner" })
    ).toThrow(AppError)
  })
})

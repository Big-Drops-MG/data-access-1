import { describe, expect, it } from "vitest"

import {
  createInvitationSecret,
  encodeInvitationValue,
  hashInvitationSecret,
  invitationExpiresAt,
  invitationIdentifier,
  INVITATION_TTL_MS,
  isInvitationLive,
  parseInvitationValue,
} from "./invitation"

describe("invitation values", () => {
  it("stores a hash and role, not the raw secret", () => {
    const secret = createInvitationSecret()
    const stored = encodeInvitationValue("operator", secret)

    expect(secret.length).toBeGreaterThan(20)
    expect(stored).toBe(`v1:operator:${hashInvitationSecret(secret)}`)
    expect(stored).not.toContain(secret)
    expect(parseInvitationValue(stored)).toEqual({ role: "operator" })
  })

  it("rejects malformed stored values", () => {
    expect(parseInvitationValue("operator")).toBeNull()
    expect(parseInvitationValue("v1:owner:abcd")).toBeNull()
    expect(parseInvitationValue(`v1:admin:${"a".repeat(63)}`)).toBeNull()
  })

  it("expires seven days after it is issued", () => {
    const now = new Date("2026-11-12T00:00:00.000Z")
    const expiresAt = invitationExpiresAt(now)
    expect(expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS)
    expect(isInvitationLive(expiresAt, now)).toBe(true)
    expect(isInvitationLive(expiresAt, expiresAt)).toBe(false)
  })

  it("keys invitations by the normalised email", () => {
    expect(invitationIdentifier(" Ada@BigDropsMarketing.com ")).toBe(
      "user-invite:ada@bigdropsmarketing.com"
    )
  })
})

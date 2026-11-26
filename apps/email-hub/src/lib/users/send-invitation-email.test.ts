import { afterEach, describe, expect, it, vi } from "vitest"

import type { MailTransport } from "@workspace/emails"

import { sendUserInvitationEmail } from "./send-invitation-email"

describe("sendUserInvitationEmail", () => {
  const originalFrom = process.env.INVITE_FROM_EMAIL
  const originalBase = process.env.BETTER_AUTH_URL

  afterEach(() => {
    process.env.INVITE_FROM_EMAIL = originalFrom
    process.env.BETTER_AUTH_URL = originalBase
  })

  it("renders the React Email invitation and sends it through the transport", async () => {
    delete process.env.INVITE_FROM_EMAIL
    process.env.BETTER_AUTH_URL = "https://hub.example/"

    const send = vi.fn().mockResolvedValue({ providerMessageId: "msg-1" })
    const transport: MailTransport = { send }

    await sendUserInvitationEmail(
      {
        recipientEmail: "nidhi@bigdropsmarketing.com",
        role: "operator",
        expiresAt: new Date("2026-12-02T16:00:00.000Z"),
        invitedByName: "Sami Wasta",
      },
      transport
    )

    expect(send).toHaveBeenCalledTimes(1)
    const sent = send.mock.calls[0]?.[0]
    expect(sent).toMatchObject({
      from: "EmailHub <notify@mail.dataaccess1.net>",
      to: "nidhi@bigdropsmarketing.com",
      subject: "You're invited to EmailHub",
    })
    expect(sent?.html).toContain("https://hub.example/login")
    expect(sent?.text).toContain("Sami Wasta invited you to join EmailHub")
  })
})

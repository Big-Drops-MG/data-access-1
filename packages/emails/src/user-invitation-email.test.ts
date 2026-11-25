import { describe, expect, it } from "vitest"

import { renderUserInvitationEmail } from "./user-invitation-email.js"

describe("renderUserInvitationEmail", () => {
  it("renders html and plain text with role, recipient, inviter, and sign-in link", async () => {
    const rendered = await renderUserInvitationEmail({
      recipientEmail: "nidhi@bigdropsmarketing.com",
      role: "operator",
      signInUrl: "https://hub.example/login",
      expiresAt: new Date("2026-12-02T16:00:00.000Z"),
      invitedByName: "Sami Wasta",
    })

    expect(rendered.subject).toBe("You're invited to EmailHub")
    expect(rendered.html).toContain(
      "Sami Wasta invited you to join EmailHub as Operator."
    )
    expect(rendered.html).toContain("nidhi@bigdropsmarketing.com")
    expect(rendered.html).toContain("https://hub.example/login")
    expect(rendered.html).toContain("Dec 2, 2026")
    expect(rendered.text).toContain(
      "Sami Wasta invited you to join EmailHub as Operator."
    )
    expect(rendered.text).toContain("https://hub.example/login")
  })

  it("renders a generic inviter line when invitedByName is omitted", async () => {
    const rendered = await renderUserInvitationEmail({
      recipientEmail: "riya@bigdropsmarketing.com",
      role: "viewer",
      signInUrl: "http://localhost:3000/login",
      expiresAt: new Date("2026-12-02T16:00:00.000Z"),
    })

    expect(rendered.html).toContain(
      "You have been invited to join EmailHub as Viewer."
    )
    expect(rendered.text).toContain(
      "You have been invited to join EmailHub as Viewer."
    )
  })
})

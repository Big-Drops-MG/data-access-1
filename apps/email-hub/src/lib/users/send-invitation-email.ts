import { createMailTransport, type MailTransport } from "@workspace/emails"
import {
  renderUserInvitationEmail,
  type InvitationRole,
} from "@workspace/emails/invitation"
import { getContextLogger, maskEmail } from "@workspace/logger"

export type SendUserInvitationEmailInput = {
  recipientEmail: string
  role: InvitationRole
  expiresAt: Date
  invitedByName?: string | null
}

const DEFAULT_INVITE_FROM = "EmailHub <notify@mail.dataaccess1.net>"

function buildSignInUrl(): string {
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").trim()
  return `${base.replace(/\/+$/, "")}/login`
}

function buildMailTransport(): MailTransport {
  const transport =
    process.env.MAIL_TRANSPORT === "ses" ? ("ses" as const) : ("smtp" as const)
  return createMailTransport({
    MAIL_TRANSPORT: transport,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SES_REGION: process.env.SES_REGION,
    SES_CONFIGURATION_SET: process.env.SES_CONFIGURATION_SET,
  })
}

export async function sendUserInvitationEmail(
  input: SendUserInvitationEmailInput,
  transport: MailTransport = buildMailTransport()
): Promise<void> {
  const from = (process.env.INVITE_FROM_EMAIL ?? DEFAULT_INVITE_FROM).trim()
  const rendered = await renderUserInvitationEmail({
    recipientEmail: input.recipientEmail,
    role: input.role,
    signInUrl: buildSignInUrl(),
    expiresAt: input.expiresAt,
    invitedByName: input.invitedByName,
  })

  await transport.send({
    from,
    to: input.recipientEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  })

  getContextLogger().info(
    {
      event: "user.invitation_email_sent",
      recipient: maskEmail(input.recipientEmail),
      role: input.role,
    },
    "User invitation email sent"
  )
}

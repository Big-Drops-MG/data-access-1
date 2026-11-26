import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { render } from "@react-email/render"
import type { CSSProperties } from "react"

export type InvitationRole = "admin" | "operator" | "viewer"

export type UserInvitationEmailProps = {
  recipientEmail: string
  role: InvitationRole
  signInUrl: string
  expiresAt: Date
  invitedByName?: string | null
}

export type RenderedUserInvitationEmail = {
  subject: string
  html: string
  text: string
}

const ROLE_LABELS: Record<InvitationRole, string> = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer",
}

const ROLE_DESCRIPTIONS: Record<InvitationRole, string> = {
  admin: "Manage domains, routes, users, API clients, and queues.",
  operator: "Run sends, manage templates, suppression, and feedback.",
  viewer: "Read-only access across EmailHub with masked recipient emails.",
}

function formatExpiryUtc(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date)
}

export function UserInvitationEmail({
  recipientEmail,
  role,
  signInUrl,
  expiresAt,
  invitedByName,
}: UserInvitationEmailProps) {
  const roleLabel = ROLE_LABELS[role]
  const roleDescription = ROLE_DESCRIPTIONS[role]
  const inviterLine = invitedByName?.trim()
    ? `${invitedByName.trim()} invited you to join EmailHub as ${roleLabel}.`
    : `You have been invited to join EmailHub as ${roleLabel}.`

  return (
    <Html lang="en">
      <Head />
      <Preview>You&apos;re invited to EmailHub ({roleLabel})</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={brandStyle}>DA1 | EmailHub</Text>
          <Heading style={headingStyle}>
            You&apos;re invited to EmailHub
          </Heading>
          <Text style={paragraphStyle}>{inviterLine}</Text>
          <Section style={roleCardStyle}>
            <Text style={roleTitleStyle}>Role: {roleLabel}</Text>
            <Text style={roleDescStyle}>{roleDescription}</Text>
          </Section>
          <Text style={paragraphStyle}>
            Sign in with your Google Workspace account (
            <strong>{recipientEmail}</strong>). You will set up two-step
            verification the first time you sign in.
          </Text>
          <Section style={ctaWrapStyle}>
            <Button href={signInUrl} style={buttonStyle}>
              Sign in to EmailHub
            </Button>
          </Section>
          <Text style={mutedStyle}>
            Or copy and paste this link into your browser:{" "}
            <Link href={signInUrl} style={linkStyle}>
              {signInUrl}
            </Link>
          </Text>
          <Hr style={hrStyle} />
          <Text style={footerStyle}>
            This invitation expires on {formatExpiryUtc(expiresAt)}. If you were
            not expecting this email, you can safely ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export async function renderUserInvitationEmail(
  props: UserInvitationEmailProps
): Promise<RenderedUserInvitationEmail> {
  const element = <UserInvitationEmail {...props} />
  const [html, text] = await Promise.all([
    render(element, { pretty: false }),
    render(element, { plainText: true }),
  ])
  return {
    subject: "You're invited to EmailHub",
    html,
    text,
  }
}

const bodyStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  margin: 0,
  padding: "32px 16px",
}

const containerStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  margin: "0 auto",
  maxWidth: "520px",
  padding: "32px",
}

const brandStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  margin: "0 0 16px 0",
}

const headingStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "22px",
  fontWeight: 700,
  lineHeight: "28px",
  margin: "0 0 12px 0",
}

const paragraphStyle: CSSProperties = {
  color: "#334155",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px 0",
}

const roleCardStyle: CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  margin: "0 0 16px 0",
  padding: "12px 16px",
}

const roleTitleStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 600,
  margin: "0 0 4px 0",
}

const roleDescStyle: CSSProperties = {
  color: "#475569",
  fontSize: "13px",
  lineHeight: "19px",
  margin: 0,
}

const ctaWrapStyle: CSSProperties = {
  margin: "24px 0",
}

const buttonStyle: CSSProperties = {
  backgroundColor: "#0f172a",
  borderRadius: "8px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
}

const mutedStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 16px 0",
  wordBreak: "break-all",
}

const linkStyle: CSSProperties = {
  color: "#0f172a",
  textDecoration: "underline",
}

const hrStyle: CSSProperties = {
  borderColor: "#e2e8f0",
  margin: "20px 0",
}

const footerStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
}

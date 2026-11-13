import { createHash } from "node:crypto"

import { simpleParser, type ParsedMail, type HeaderValue } from "mailparser"

export type IntakeReportKind = "arf" | "dsn"

export type ParsedIntakeReport = {
  kind: IntakeReportKind
  reportMessageId: string
  contentHash: string
  provider: "jmrp" | "yahoo"
  feedbackType: string | null
  originalMessageIds: string[]
  sesMessageIds: string[]
  recipientEmails: string[]
  action: string | null
}

const SES_ID_RE = /^[A-Za-z0-9@._-]{1,256}$/

function headerString(value: HeaderValue | undefined): string | null {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === "string" ? first : null
  }
  if (typeof value === "object" && "value" in value) {
    const nested = (value as { value?: unknown }).value
    return typeof nested === "string" ? nested : null
  }
  return null
}

function normalizeMessageId(raw: string): string {
  return raw.trim().replace(/^<|>$/g, "").trim().toLowerCase()
}

function collectMessageIds(
  ...values: Array<string | null | undefined>
): string[] {
  const out = new Set<string>()
  for (const value of values) {
    if (!value) {
      continue
    }
    for (const part of value.split(/[\s,]+/)) {
      const id = normalizeMessageId(part)
      if (id.length > 0) {
        out.add(id)
      }
    }
  }
  return [...out]
}

function extractEmails(raw: string | null | undefined): string[] {
  if (!raw) {
    return []
  }
  const matches = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
  return [...new Set(matches.map((email) => email.trim().toLowerCase()))]
}

function contentTypeOf(mail: ParsedMail): string {
  return (headerString(mail.headers.get("content-type")) ?? "").toLowerCase()
}

function reportTypeOf(mail: ParsedMail): string | null {
  const raw = contentTypeOf(mail)
  const match = raw.match(/report-type\s*=\s*"?([^";\s]+)"?/i)
  if (match?.[1]) {
    return match[1].toLowerCase()
  }
  if (findAttachment(mail, "message/feedback-report")) {
    return "feedback-report"
  }
  if (findAttachment(mail, "message/delivery-status")) {
    return "delivery-status"
  }
  return null
}

function isMultipartReport(mail: ParsedMail): boolean {
  const type = contentTypeOf(mail)
  return (
    type.includes("multipart/report") ||
    reportTypeOf(mail) !== null ||
    Boolean(findAttachment(mail, "message/feedback-report")) ||
    Boolean(findAttachment(mail, "message/delivery-status"))
  )
}

function findAttachment(
  mail: ParsedMail,
  contentTypeIncludes: string
): string | null {
  const needle = contentTypeIncludes.toLowerCase()
  for (const part of mail.attachments ?? []) {
    const type = (part.contentType ?? "").toLowerCase()
    if (!type.includes(needle)) {
      continue
    }
    if (Buffer.isBuffer(part.content)) {
      return part.content.toString("utf8")
    }
    if (typeof part.content === "string") {
      return part.content
    }
  }
  return null
}

function parseFeedbackFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of body.split(/\r?\n/)) {
    const sep = line.indexOf(":")
    if (sep <= 0) {
      continue
    }
    const key = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()
    if (key.length > 0 && value.length > 0) {
      fields[key] = value
    }
  }
  return fields
}

function detectProvider(
  mail: ParsedMail,
  fields: Record<string, string>
): "jmrp" | "yahoo" {
  const fromAddress = mail.from?.value?.[0]?.address ?? ""
  const haystack = [
    fromAddress,
    mail.from?.text ?? "",
    fields["user-agent"] ?? "",
    fields["reporting-mta"] ?? "",
  ]
    .join(" ")
    .toLowerCase()
  if (haystack.includes("yahoo")) {
    return "yahoo"
  }
  return "jmrp"
}

function sesCandidates(...ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (SES_ID_RE.test(id)) {
      out.push(id)
    }
    const local = id.split("@")[0]
    if (local && SES_ID_RE.test(local) && local !== id) {
      out.push(local)
    }
  }
  return [...new Set(out)]
}

/**
 * Classify and extract match keys from a raw RFC822 message.
 * Returns null when the mail is not an ARF or DSN multipart/report.
 */
function rawContentTypeHeader(rawText: string): string {
  const match = rawText.match(/^Content-Type:\s*(.+)$/im)
  return (match?.[1] ?? "").toLowerCase()
}

export async function parseIntakeMail(
  raw: Buffer | string
): Promise<ParsedIntakeReport | null> {
  const rawText = typeof raw === "string" ? raw : raw.toString("utf8")
  const mail = await simpleParser(raw)
  const headerContentType = rawContentTypeHeader(rawText)
  const contentType = `${contentTypeOf(mail)} ${headerContentType}`
  const reportType =
    reportTypeOf(mail) ??
    headerContentType
      .match(/report-type\s*=\s*"?([^";\s]+)"?/i)?.[1]
      ?.toLowerCase() ??
    null

  const looksLikeReport =
    isMultipartReport(mail) ||
    headerContentType.includes("multipart/report") ||
    reportType === "feedback-report" ||
    reportType === "delivery-status"

  if (!looksLikeReport) {
    return null
  }

  const reportMessageId =
    normalizeMessageId(mail.messageId ?? "") || contentHashFor(rawText)

  if (
    reportType === "feedback-report" ||
    contentType.includes("feedback-report") ||
    findAttachment(mail, "message/feedback-report")
  ) {
    const feedbackBody =
      findAttachment(mail, "message/feedback-report") ??
      (typeof mail.text === "string" ? mail.text : "")
    const fields = parseFeedbackFields(feedbackBody)
    const originalMessageIds = collectMessageIds(
      fields["original-mail-message-id"],
      fields["original-message-id"]
    )
    const recipientEmails = extractEmails(
      fields["original-rcpt-to"] ?? fields["reported-domain"]
    )
    return {
      kind: "arf",
      reportMessageId,
      contentHash: contentHashFor(reportMessageId),
      provider: detectProvider(mail, fields),
      feedbackType: fields["feedback-type"] ?? null,
      originalMessageIds,
      sesMessageIds: sesCandidates(...originalMessageIds),
      recipientEmails,
      action: null,
    }
  }

  if (
    reportType === "delivery-status" ||
    contentType.includes("delivery-status") ||
    findAttachment(mail, "message/delivery-status")
  ) {
    const dsnBody =
      findAttachment(mail, "message/delivery-status") ??
      (typeof mail.text === "string" ? mail.text : "")
    const fields = parseFeedbackFields(dsnBody)
    const original = findAttachment(mail, "message/rfc822")
    const originalIds = collectMessageIds(
      fields["original-message-id"],
      original ? extractHeader(original, "message-id") : null,
      original ? extractHeader(original, "x-ses-message-id") : null
    )
    const recipientEmails = extractEmails(
      fields["final-recipient"] ?? fields["original-recipient"]
    )
    return {
      kind: "dsn",
      reportMessageId,
      contentHash: contentHashFor(reportMessageId),
      provider: detectProvider(mail, fields),
      feedbackType: null,
      originalMessageIds: originalIds,
      sesMessageIds: sesCandidates(...originalIds),
      recipientEmails,
      action: fields.action ?? null,
    }
  }

  return null
}

export function contentHashFor(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function extractHeader(raw: string, name: string): string | null {
  const re = new RegExp(`^${name}\\s*:\\s*(.+)$`, "im")
  const match = raw.match(re)
  return match?.[1]?.trim() ?? null
}

export function feedbackDedupeHashForReport(
  contentHash: string,
  kind: IntakeReportKind
): string {
  return createHash("sha256")
    .update(`mailbox_report\0${kind}\0${contentHash}`, "utf8")
    .digest("hex")
}

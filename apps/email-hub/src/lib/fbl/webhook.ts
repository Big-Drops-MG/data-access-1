import { timingSafeEqual } from "node:crypto"

import { AppError } from "@workspace/shared"

import { processFblRawMail } from "@/lib/fbl/process"

export class FblWebhookError extends Error {
  readonly kind: "unauthorized" | "invalid"

  constructor(kind: "unauthorized" | "invalid", message: string) {
    super(message)
    this.name = "FblWebhookError"
    this.kind = kind
  }
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

function requireFblSecret(): string {
  const secret = process.env.FBL_WEBHOOK_SECRET?.trim() ?? ""
  if (!secret) {
    throw AppError.unavailable([
      { path: "FBL_WEBHOOK_SECRET", message: "not configured" },
    ])
  }
  return secret
}

function extractBearer(header: string | null): string | null {
  if (!header) {
    return null
  }
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

type FblJsonBody = {
  raw?: unknown
  from?: unknown
  to?: unknown
}

function extractRawMime(
  contentTypeHeader: string | null,
  body: string
): string {
  const contentType = (contentTypeHeader ?? "").toLowerCase()

  if (contentType.includes("application/json")) {
    let parsed: FblJsonBody
    try {
      parsed = JSON.parse(body) as FblJsonBody
    } catch {
      throw new FblWebhookError("invalid", "body must be JSON")
    }
    if (typeof parsed.raw !== "string" || parsed.raw.length === 0) {
      throw new FblWebhookError("invalid", "raw MIME string required")
    }
    if (parsed.raw.trim().length === 0) {
      throw new FblWebhookError("invalid", "empty body")
    }
    return parsed.raw
  }

  if (
    contentType.includes("message/rfc822") ||
    contentType.includes("text/plain") ||
    contentType.length === 0
  ) {
    if (body.trim().length === 0) {
      throw new FblWebhookError("invalid", "empty body")
    }
    return body
  }

  throw new FblWebhookError("invalid", "unsupported content type")
}

/**
 * Cloudflare Email Worker posts JSON { raw, from?, to? } with
 * Authorization: Bearer <FBL_WEBHOOK_SECRET> or X-Fbl-Secret.
 */
export async function handleFblWebhook(input: {
  authorization: string | null
  secretHeader: string | null
  contentType: string | null
  body: string
}): Promise<{
  ok: true
  kind: "ignored" | "processed"
  report_created: boolean
  feedback_created: boolean
}> {
  const expected = requireFblSecret()
  const provided =
    extractBearer(input.authorization) ?? input.secretHeader?.trim() ?? ""
  if (!provided || !secretsEqual(provided, expected)) {
    throw new FblWebhookError("unauthorized", "invalid secret")
  }

  const raw = extractRawMime(input.contentType, input.body)
  const result = await processFblRawMail(raw)
  return {
    ok: true,
    kind: result.kind,
    report_created: result.reportCreated,
    feedback_created: result.feedbackCreated,
  }
}

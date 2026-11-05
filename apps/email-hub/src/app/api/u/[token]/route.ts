import { NextResponse } from "next/server"
import { getDb } from "@workspace/db/client"
import { getRequestId } from "@workspace/logger"
import {
  applyUnsubscribe,
  AppError,
  loadServerEnv,
  parseUnsubscribeRequestBody,
  verifyUnsubscribeToken,
} from "@workspace/shared"

import { readClientIp } from "@/lib/auth/machine-hmac"
import { handler } from "@/lib/handler"
import { consumeUnsubscribeRateLimitFromEnv } from "@/lib/unsubscribe-rate-limit"

type RouteContext = { params: Promise<{ token: string }> }

async function handlePost(
  request: Request,
  context: RouteContext
): Promise<NextResponse> {
  const ip = readClientIp(request) ?? "unknown"
  const rate = await consumeUnsubscribeRateLimitFromEnv(ip)
  if (rate === "unavailable") {
    throw AppError.unavailable()
  }
  if (rate === "limited") {
    throw AppError.rateLimited()
  }

  const { token } = await context.params
  const env = loadServerEnv("web")
  const verification = verifyUnsubscribeToken(
    [env.UNSUBSCRIBE_TOKEN_SECRET, env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS],
    token
  )
  if (verification.status === "invalid") {
    throw AppError.notFound()
  }
  if (verification.status === "expired") {
    throw AppError.gone()
  }

  const rawBody = await request.text()
  let parsed: ReturnType<typeof parseUnsubscribeRequestBody>
  try {
    parsed = parseUnsubscribeRequestBody(rawBody)
  } catch {
    throw AppError.badRequest([
      { path: "body", message: "Invalid unsubscribe body" },
    ])
  }

  const result = await applyUnsubscribe(getDb(), {
    messageId: verification.messageId,
    scope: parsed.scope,
    categoryKeys: parsed.categoryKeys,
    requestId: getRequestId(),
    ip,
    userAgent: request.headers.get("user-agent"),
  })
  if (result.status === "not_found") {
    throw AppError.notFound()
  }

  return NextResponse.json({ ok: true, scope: parsed.scope })
}

export const POST = handler(handlePost)

import { getContextLogger } from "@workspace/logger"
import { AppError } from "@workspace/shared"
import { NextResponse } from "next/server"

import { handleSesWebhook, SesWebhookError } from "@/lib/ses-webhook"
import { withApiRequest } from "@/lib/with-api-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handlePost(request: Request): Promise<NextResponse> {
  try {
    await handleSesWebhook({
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    })
    getContextLogger().info(
      { event: "ses.webhook.processed" },
      "SES webhook processed"
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SesWebhookError) {
      getContextLogger().warn(
        {
          event: "ses.webhook.rejected",
          error_code: error.kind,
          detail: error.detail,
        },
        "SES webhook rejected"
      )
      const appError =
        error.kind === "unauthorized"
          ? AppError.unauthorized([{ path: error.detail, message: "rejected" }])
          : AppError.unavailable([
              { path: error.detail, message: "unreachable" },
            ])
      return NextResponse.json(appError.toJSON(), { status: appError.status })
    }

    getContextLogger().error(
      { event: "ses.webhook.failed", err: error },
      "SES webhook failed"
    )
    const unavailable = AppError.unavailable([
      { path: "ses-webhook", message: "unreachable" },
    ])
    return NextResponse.json(unavailable.toJSON(), {
      status: unavailable.status,
    })
  }
}

export const POST = withApiRequest(handlePost)

import { getContextLogger } from "@workspace/logger"
import { AppError } from "@workspace/shared"

import { handler } from "@/lib/handler"
import { handleSesWebhook, SesWebhookError } from "@/lib/ses-webhook"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handlePost(request: Request): Promise<Response> {
  try {
    await handleSesWebhook({
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    })
    getContextLogger().info(
      { event: "ses.webhook.processed" },
      "SES webhook processed"
    )
    return Response.json({ ok: true })
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
      if (error.kind === "unauthorized") {
        throw AppError.unauthorized([
          { path: error.detail, message: "rejected" },
        ])
      }
      throw AppError.unavailable([
        { path: error.detail, message: "unreachable" },
      ])
    }

    getContextLogger().error(
      { event: "ses.webhook.failed", err: error },
      "SES webhook failed"
    )
    throw AppError.unavailable([
      { path: "ses-webhook", message: "unreachable" },
    ])
  }
}

export const POST = handler(handlePost)

import { getContextLogger } from "@workspace/logger"
import { AppError } from "@workspace/shared"

import { handler } from "@/lib/handler"
import { FblWebhookError, handleFblWebhook } from "@/lib/fbl/webhook"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handlePost(request: Request): Promise<Response> {
  try {
    const result = await handleFblWebhook({
      authorization: request.headers.get("authorization"),
      secretHeader: request.headers.get("x-fbl-secret"),
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    })
    getContextLogger().info(
      {
        event: "fbl.webhook.accepted",
        kind: result.kind,
        report_created: result.report_created,
        feedback_created: result.feedback_created,
      },
      "FBL webhook accepted"
    )
    return Response.json(result)
  } catch (error) {
    if (error instanceof FblWebhookError) {
      getContextLogger().warn(
        {
          event: "fbl.webhook.rejected",
          error_code: error.kind,
          detail: error.message,
        },
        "FBL webhook rejected"
      )
      if (error.kind === "unauthorized") {
        throw AppError.unauthorized([
          { path: "authorization", message: "rejected" },
        ])
      }
      throw AppError.validationFailed([
        { path: "body", message: error.message },
      ])
    }
    if (error instanceof AppError) {
      throw error
    }

    getContextLogger().error(
      { event: "fbl.webhook.failed", err: error },
      "FBL webhook failed"
    )
    throw AppError.unavailable([
      { path: "fbl-webhook", message: "unreachable" },
    ])
  }
}

export const POST = handler(handlePost)

import { AppError } from "@workspace/shared"
import { NextResponse } from "next/server"

import { handleSesWebhook, SesWebhookError } from "@/lib/ses-webhook"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    await handleSesWebhook({
      contentType: request.headers.get("content-type"),
      body: await request.text(),
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof SesWebhookError) {
      const appError =
        error.kind === "unauthorized"
          ? AppError.unauthorized([{ path: error.detail, message: "rejected" }])
          : AppError.unavailable([
              { path: error.detail, message: "unreachable" },
            ])
      return NextResponse.json(appError.toJSON(), { status: appError.status })
    }

    console.error("ses webhook failed")
    const unavailable = AppError.unavailable([
      { path: "ses-webhook", message: "unreachable" },
    ])
    return NextResponse.json(unavailable.toJSON(), {
      status: unavailable.status,
    })
  }
}

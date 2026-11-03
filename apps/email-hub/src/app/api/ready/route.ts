import { AppError } from "@workspace/shared"
import { NextResponse } from "next/server"

import { checkReadiness } from "@/lib/readiness"
import { withApiRequest } from "@/lib/with-api-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handleGet(): Promise<NextResponse> {
  const failing = await checkReadiness()
  if (failing.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const error = AppError.unavailable(
    failing.map((name) => ({
      path: name,
      message: "unreachable",
    }))
  )

  return NextResponse.json(error.toJSON(), { status: error.status })
}

export const GET = withApiRequest(handleGet)

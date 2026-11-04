import { AppError } from "@workspace/shared"

import { jsonAppError } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { checkReadiness } from "@/lib/readiness"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handleGet(_request: Request): Promise<Response> {
  const failing = await checkReadiness()
  if (failing.length === 0) {
    return Response.json({ ok: true })
  }

  return jsonAppError(
    AppError.unavailable(
      failing.map((name) => ({
        path: name,
        message: "unreachable",
      }))
    )
  )
}

export const GET = handler(handleGet)

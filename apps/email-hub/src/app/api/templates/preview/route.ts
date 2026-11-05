import { z } from "zod"

import { handler } from "@/lib/handler"
import { previewTemplate } from "@/lib/templates/preview"
import { requireTemplatesStaffAccess } from "@/lib/templates/staff-access"
import { parseJsonBody, parseOrThrow } from "@/lib/zod-parse"

export const runtime = "nodejs"

const previewBodySchema = z
  .object({
    subject: z.string().min(1).max(998),
    body_source: z.string().min(1).max(500_000),
    merge_data: z.record(z.string(), z.string()).optional(),
  })
  .strict()

/** POST /api/templates/preview — sandboxed HTML preview (Operator+). */
async function handlePost(request: Request): Promise<Response> {
  await requireTemplatesStaffAccess(request, "POST")
  const body = parseOrThrow(previewBodySchema, await parseJsonBody(request))

  const result = await previewTemplate({
    subject: body.subject,
    bodySource: body.body_source,
    mergeData: body.merge_data,
  })

  return Response.json(result)
}

export const POST = handler(handlePost)

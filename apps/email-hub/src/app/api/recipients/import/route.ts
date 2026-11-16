import { getRequestId } from "@workspace/logger"
import { AppError } from "@workspace/shared"

import { jsonForRole } from "@/lib/api-response"
import { handler } from "@/lib/handler"
import { importRecipientsCsv } from "@/lib/recipients/import-service"
import { requireRecipientsStaffAccess } from "@/lib/recipients/staff-access"

/** POST /api/recipients/import — CSV upload (Operator+). Returns 202 + upload_id. */
async function handlePost(request: Request): Promise<Response> {
  const session = await requireRecipientsStaffAccess(request, "POST")

  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw AppError.validationFailed([
      { path: "file", message: "Expected multipart/form-data with a CSV file" },
    ])
  }

  const form = await request.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    throw AppError.validationFailed([
      { path: "file", message: "CSV file is required" },
    ])
  }

  const result = await importRecipientsCsv(file, {
    userId: session.id,
    requestId: getRequestId(),
  })

  return jsonForRole(session.role, result, { status: 202 })
}

export const POST = handler(handlePost)

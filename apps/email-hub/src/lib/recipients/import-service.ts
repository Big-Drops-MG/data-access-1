import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import { getRequestId } from "@workspace/logger"
import { AppError, enqueueCsvIngestJob } from "@workspace/shared"
import {
  RECIPIENT_IMPORT_MAX_BYTES,
  assertCsvImportHeaders,
  assertSafeRecipientImportBytes,
  assertSafeUploadFilename,
  recipientImportsDir,
} from "@workspace/shared/recipient-csv-ingest"
import { v7 as uuidv7 } from "uuid"

import { getIntakeQueue } from "@/lib/intake-queue"

export type ImportRecipientsActor = {
  userId: string
  requestId?: string | null
}

const CSV_CONTENT_TYPES = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
])

const BLOCKED_CONTENT_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
])

function validationFailed(message: string): never {
  throw AppError.validationFailed([{ path: "file", message }])
}

async function removeUpload(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined)
}

export async function importRecipientsCsv(
  file: File,
  actor: ImportRecipientsActor
): Promise<{ upload_id: string }> {
  try {
    assertSafeUploadFilename(file.name)
  } catch (error) {
    validationFailed(
      error instanceof Error ? error.message : "Invalid file name"
    )
  }

  const contentType = (file.type || "").toLowerCase().split(";")[0]?.trim()
  if (contentType && BLOCKED_CONTENT_TYPES.has(contentType)) {
    validationFailed(
      "Excel workbooks are not accepted. Export as a plain CSV file."
    )
  }
  if (contentType && !CSV_CONTENT_TYPES.has(contentType)) {
    validationFailed("Content type must be CSV")
  }

  if (file.size <= 0) {
    validationFailed("File is empty")
  }

  if (file.size > RECIPIENT_IMPORT_MAX_BYTES) {
    validationFailed(
      `File must be at most ${RECIPIENT_IMPORT_MAX_BYTES} bytes (50 MB)`
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  try {
    assertSafeRecipientImportBytes(buffer)
  } catch (error) {
    validationFailed(
      error instanceof Error ? error.message : "File is not a valid CSV"
    )
  }

  const uploadId = uuidv7().toLowerCase()
  const dir = recipientImportsDir()
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${uploadId}.csv`)

  await writeFile(filePath, buffer)

  try {
    await assertCsvImportHeaders(filePath)
  } catch (error) {
    await removeUpload(filePath)
    validationFailed(
      error instanceof Error ? error.message : "CSV headers are invalid"
    )
  }

  try {
    await enqueueCsvIngestJob(getIntakeQueue(), {
      upload_id: uploadId,
      file_path: filePath,
      actor_user_id: actor.userId,
      request_id: actor.requestId ?? getRequestId(),
    })
  } catch (error) {
    await removeUpload(filePath)
    throw AppError.unavailable([
      {
        path: "queue",
        message:
          error instanceof Error
            ? error.message
            : "Could not enqueue csv-ingest",
      },
    ])
  }

  return { upload_id: uploadId }
}

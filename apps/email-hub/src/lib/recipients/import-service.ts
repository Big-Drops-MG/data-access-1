import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { getRequestId } from "@workspace/logger"
import {
  AppError,
  RECIPIENT_IMPORT_MAX_BYTES,
  assertCsvHasEmailColumn,
  enqueueCsvIngestJob,
  recipientImportsDir,
} from "@workspace/shared"
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

function isCsvFilename(name: string): boolean {
  return name.toLowerCase().endsWith(".csv")
}

export async function importRecipientsCsv(
  file: File,
  actor: ImportRecipientsActor
): Promise<{ upload_id: string }> {
  if (!isCsvFilename(file.name)) {
    throw AppError.validationFailed([
      { path: "file", message: "Only .csv files are accepted" },
    ])
  }

  const contentType = (file.type || "").toLowerCase().split(";")[0]?.trim()
  if (contentType && !CSV_CONTENT_TYPES.has(contentType)) {
    throw AppError.validationFailed([
      { path: "file", message: "Content type must be CSV" },
    ])
  }

  if (file.size <= 0) {
    throw AppError.validationFailed([
      { path: "file", message: "File is empty" },
    ])
  }

  if (file.size > RECIPIENT_IMPORT_MAX_BYTES) {
    throw AppError.validationFailed([
      {
        path: "file",
        message: `File must be at most ${RECIPIENT_IMPORT_MAX_BYTES} bytes (50 MB)`,
      },
    ])
  }

  const uploadId = uuidv7().toLowerCase()
  const dir = recipientImportsDir()
  await mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${uploadId}.csv`)

  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(filePath, buffer)

  try {
    await assertCsvHasEmailColumn(filePath)
  } catch {
    throw AppError.validationFailed([
      { path: "file", message: "CSV must include an email column" },
    ])
  }

  try {
    await enqueueCsvIngestJob(getIntakeQueue(), {
      upload_id: uploadId,
      file_path: filePath,
      actor_user_id: actor.userId,
      request_id: actor.requestId ?? getRequestId(),
    })
  } catch (error) {
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

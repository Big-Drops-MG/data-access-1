import { UnrecoverableError } from "bullmq"

import { getDb, type Database } from "@workspace/db/client"
import { getContextLogger } from "@workspace/logger"
import {
  ingestRecipientCsvFile,
  writeAudit,
  type CsvIngestJobData,
} from "@workspace/shared"

export type ProcessCsvIngestDeps = {
  db?: Database
  ingestFile?: typeof ingestRecipientCsvFile
}

export async function processCsvIngestJob(
  data: CsvIngestJobData,
  deps: ProcessCsvIngestDeps = {}
): Promise<{
  upload_id: string
  counts: Awaited<ReturnType<typeof ingestRecipientCsvFile>>
}> {
  const logger = getContextLogger()
  const uploadId = data.upload_id?.trim()
  const filePath = data.file_path?.trim()
  if (!uploadId || !filePath) {
    throw new UnrecoverableError("csv-ingest requires upload_id and file_path")
  }

  const db = deps.db ?? getDb()
  const ingest = deps.ingestFile ?? ingestRecipientCsvFile

  logger.info(
    {
      event: "csv_ingest.started",
      upload_id: uploadId,
    },
    "CSV ingest started"
  )

  const counts = await ingest(db, filePath)

  const actor = data.actor_user_id
    ? { type: "user" as const, id: data.actor_user_id }
    : { type: "system" as const }

  await writeAudit(db, {
    actor,
    action: "recipient.import.completed",
    objectType: "recipient_import",
    objectId: uploadId,
    requestId: data.request_id,
    after: {
      upload_id: uploadId,
      file_path: filePath,
      ...counts,
    },
  })

  logger.info(
    {
      event: "csv_ingest.completed",
      upload_id: uploadId,
      ...counts,
    },
    "CSV ingest completed"
  )

  return { upload_id: uploadId, counts }
}

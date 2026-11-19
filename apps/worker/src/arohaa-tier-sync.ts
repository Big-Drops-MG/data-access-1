import type { Database } from "@workspace/db/client"
import {
  processArohaaTierSyncJob,
  type ArohaaTierSyncJobData,
  type ArohaaTierSyncResult,
  type TriggerEmailDeps,
} from "@workspace/shared"

export async function handleArohaaTierSyncJob(
  data: ArohaaTierSyncJobData,
  deps: {
    db: Database
    enqueueSendEmail: TriggerEmailDeps["enqueueSendEmail"]
  }
): Promise<ArohaaTierSyncResult> {
  return processArohaaTierSyncJob(data, {
    db: deps.db,
    enqueueSendEmail: deps.enqueueSendEmail,
  })
}

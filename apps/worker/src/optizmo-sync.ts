import { UnrecoverableError } from "bullmq"
import type { Queue } from "bullmq"

import type { Database } from "@workspace/db/client"
import {
  processOptizmoSyncJob,
  type OptizmoSyncEnv,
  type OptizmoSyncJobData,
  type OptizmoSyncResult,
} from "@workspace/shared"

export async function handleOptizmoSyncJob(
  data: OptizmoSyncJobData,
  deps: {
    db: Database
    env: OptizmoSyncEnv
    syncQueue: Pick<Queue<OptizmoSyncJobData>, "add" | "getJob">
  }
): Promise<OptizmoSyncResult> {
  return processOptizmoSyncJob(data, {
    db: deps.db,
    env: deps.env,
    syncQueue: deps.syncQueue,
    permanentFailure: (message) => new UnrecoverableError(message),
  })
}

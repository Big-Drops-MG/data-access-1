/**
 * One-shot local provider-metrics pull.
 * Usage (from repo root):
 *   node --env-file=apps/email-hub/.env --import tsx apps/worker/scripts/run-provider-metrics-pull.ts
 */
import { getDb } from "@workspace/db/client"
import { closeClickHouseClient } from "@workspace/db/clickhouse"
import {
  WORKER_SERVICE,
  createLogger,
  setFallbackLogger,
} from "@workspace/logger"
import { loadServerEnv, resetServerEnvCache } from "@workspace/shared"

import { processProviderMetricsPull } from "../src/provider-metrics-pull.js"

setFallbackLogger(createLogger({ service: WORKER_SERVICE }))
resetServerEnvCache()
const env = loadServerEnv("worker")

const hasPostmaster = Boolean(
  env.GOOGLE_POSTMASTER_CLIENT_ID &&
  env.GOOGLE_POSTMASTER_CLIENT_SECRET &&
  env.GOOGLE_POSTMASTER_REFRESH_TOKEN
)
const hasSnds = Boolean(env.SNDS_KEY || env.SNDS_DATA_URL)

process.stdout.write(
  `${JSON.stringify(
    {
      postmaster_env: hasPostmaster ? "present" : "missing",
      snds_env: hasSnds ? "present" : "missing",
    },
    null,
    2
  )}\n`
)

try {
  const result = await processProviderMetricsPull({
    db: getDb(),
    env,
  })
  process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`)
  process.exitCode = 0
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(
    `${JSON.stringify({ ok: false, error: message }, null, 2)}\n`
  )
  process.exitCode = 1
} finally {
  await closeClickHouseClient().catch(() => undefined)
  process.exit()
}

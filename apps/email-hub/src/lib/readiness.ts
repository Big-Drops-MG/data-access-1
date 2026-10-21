import { getPool } from "@workspace/db/client"
import { Redis } from "ioredis"

export const READINESS_DEPENDENCIES = [
  "postgres",
  "redis",
  "clickhouse",
] as const

export type ReadinessDependency = (typeof READINESS_DEPENDENCIES)[number]

export const READINESS_TIMEOUT_MS = 2_000

const probes: Record<ReadinessDependency, () => Promise<void>> = {
  postgres: probePostgres,
  redis: probeRedis,
  clickhouse: probeClickhouse,
}

export async function checkReadiness(
  timeoutMs: number = READINESS_TIMEOUT_MS
): Promise<ReadinessDependency[]> {
  const results = await Promise.all(
    READINESS_DEPENDENCIES.map(async (name) => {
      try {
        await withTimeout(probes[name](), timeoutMs)
        return null
      } catch {
        return name
      }
    })
  )

  return results.filter((name): name is ReadinessDependency => name !== null)
}

async function probePostgres(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }

  await getPool().query("select 1")
}

async function probeRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error("REDIS_URL is not configured")
  }

  const redis = new Redis(redisUrl, {
    connectTimeout: READINESS_TIMEOUT_MS,
    commandTimeout: READINESS_TIMEOUT_MS,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    enableOfflineQueue: false,
    lazyConnect: true,
  })
  redis.on("error", () => undefined)

  try {
    await redis.connect()
    const reply = await redis.ping()
    if (reply !== "PONG") {
      throw new Error("Redis ping failed")
    }
  } finally {
    redis.disconnect()
  }
}

async function probeClickhouse(): Promise<void> {
  const clickhouseUrl = process.env.CLICKHOUSE_URL
  if (!clickhouseUrl) {
    throw new Error("CLICKHOUSE_URL is not configured")
  }

  const response = await fetch(new URL("/ping", clickhouseUrl), {
    signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error("ClickHouse ping failed")
  }

  const body = (await response.text()).trim()
  if (!body.startsWith("Ok")) {
    throw new Error("ClickHouse ping failed")
  }
}

function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"))
    }, timeoutMs)

    promise.then(
      () => {
        clearTimeout(timer)
        resolve()
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

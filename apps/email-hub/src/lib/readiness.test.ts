import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { checkReadiness } from "./readiness.js"

const db = vi.hoisted(() => ({
  query: vi.fn(),
  getPool: vi.fn(),
}))

const redis = vi.hoisted(() => ({
  constructed: 0,
  connect: vi.fn(),
  ping: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock("@workspace/db/client", () => ({
  getPool: db.getPool,
}))

vi.mock("ioredis", () => ({
  Redis: class Redis {
    constructor() {
      redis.constructed += 1
    }

    connect = redis.connect
    ping = redis.ping
    disconnect = redis.disconnect
    on = vi.fn()
  },
}))

const fetchMock = vi.fn()

function clickhouseOk(): Response {
  return new Response("Ok.\n", { status: 200 })
}

describe("checkReadiness", () => {
  beforeEach(() => {
    db.query.mockReset()
    db.query.mockResolvedValue({ rows: [] })
    db.getPool.mockReset()
    db.getPool.mockReturnValue({ query: db.query })
    redis.constructed = 0
    redis.connect.mockReset()
    redis.connect.mockResolvedValue(undefined)
    redis.ping.mockReset()
    redis.ping.mockResolvedValue("PONG")
    redis.disconnect.mockReset()
    redis.disconnect.mockReturnValue(undefined)
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(clickhouseOk())
    vi.stubGlobal("fetch", fetchMock)
    vi.stubEnv(
      "DATABASE_URL",
      "postgresql://emailhub_app:emailhub@127.0.0.1:5432/emailhub"
    )
    vi.stubEnv("REDIS_URL", "redis://:emailhub@127.0.0.1:6379")
    vi.stubEnv("CLICKHOUSE_URL", "http://127.0.0.1:8123")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("returns no failures when postgres, redis, and clickhouse answer", async () => {
    await expect(checkReadiness()).resolves.toEqual([])
    expect(db.query).toHaveBeenCalledWith("select 1")
    expect(redis.ping).toHaveBeenCalledOnce()
    expect(redis.disconnect).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:8123/ping"
    )
  })

  it("names postgres when the query fails", async () => {
    db.query.mockRejectedValue(new Error("connection refused"))

    await expect(checkReadiness()).resolves.toEqual(["postgres"])
  })

  it("names postgres when DATABASE_URL is missing", async () => {
    vi.stubEnv("DATABASE_URL", "")

    await expect(checkReadiness()).resolves.toEqual(["postgres"])
    expect(db.getPool).not.toHaveBeenCalled()
  })

  it("names postgres when the pool cannot be created", async () => {
    db.getPool.mockImplementation(() => {
      throw new Error("DATABASE_URL must use the postgresql protocol.")
    })

    await expect(checkReadiness()).resolves.toEqual(["postgres"])
  })

  it("names postgres when the query exceeds the timeout", async () => {
    db.query.mockReturnValue(new Promise(() => undefined))

    await expect(checkReadiness(20)).resolves.toEqual(["postgres"])
  })

  it("names redis when ping does not return PONG", async () => {
    redis.ping.mockResolvedValue("LOADING")

    await expect(checkReadiness()).resolves.toEqual(["redis"])
    expect(redis.disconnect).toHaveBeenCalledOnce()
  })

  it("names redis when REDIS_URL is missing", async () => {
    vi.stubEnv("REDIS_URL", "")

    await expect(checkReadiness()).resolves.toEqual(["redis"])
    expect(redis.constructed).toBe(0)
  })

  it("names clickhouse when the ping body is not Ok", async () => {
    fetchMock.mockResolvedValue(new Response("no", { status: 200 }))

    await expect(checkReadiness()).resolves.toEqual(["clickhouse"])
  })

  it("names clickhouse when ping is not successful", async () => {
    fetchMock.mockResolvedValue(new Response("Ok.\n", { status: 503 }))

    await expect(checkReadiness()).resolves.toEqual(["clickhouse"])
  })

  it("names clickhouse when CLICKHOUSE_URL is missing or invalid", async () => {
    vi.stubEnv("CLICKHOUSE_URL", "")
    await expect(checkReadiness()).resolves.toEqual(["clickhouse"])

    vi.stubEnv("CLICKHOUSE_URL", "not a url")
    await expect(checkReadiness()).resolves.toEqual(["clickhouse"])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("names every dependency that fails, in probe order", async () => {
    db.query.mockRejectedValue(new Error("down"))
    redis.connect.mockRejectedValue(new Error("down"))
    fetchMock.mockRejectedValue(new Error("down"))

    await expect(checkReadiness()).resolves.toEqual([
      "postgres",
      "redis",
      "clickhouse",
    ])
    expect(redis.disconnect).toHaveBeenCalledOnce()
  })
})

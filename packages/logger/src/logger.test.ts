import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import pino, { type Logger } from "pino"
import { afterEach, describe, expect, it } from "vitest"

import { serializeError } from "./errors.js"
import { createLogger, readJobCorrelation } from "./logger.js"
import { maskEmail } from "./mask-email.js"
import {
  getContextLogger,
  getRequestId,
  runWithRequestContext,
} from "./request-context.js"
import { isValidRequestId, resolveRequestId } from "./request-id.js"

const SECRET = "synthetic-password"
const TOKEN = "synthetic-access-token"
const REFRESH = "synthetic-refresh-token"
const COOKIE = "synthetic-cookie"
const AWS_SECRET = "synthetic-aws-secret"
const SMTP_SECRET = "synthetic-smtp-secret"
const DB_SECRET = "synthetic-db-password"
const HTML = "synthetic-html-body"
const UNSUB = "synthetic-unsub-token"

const envSnapshot = {
  LOG_LEVEL: process.env.LOG_LEVEL,
  LOG_FORMAT: process.env.LOG_FORMAT,
  EMAILHUB_ENV: process.env.EMAILHUB_ENV,
  NODE_ENV: process.env.NODE_ENV,
}

afterEach(() => {
  restoreEnv("LOG_LEVEL", envSnapshot.LOG_LEVEL)
  restoreEnv("LOG_FORMAT", envSnapshot.LOG_FORMAT)
  restoreEnv("EMAILHUB_ENV", envSnapshot.EMAILHUB_ENV)
  restoreEnv("NODE_ENV", envSnapshot.NODE_ENV)
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

function capture(logger: Logger): string[] {
  const lines: string[] = []
  const stream = logger[pino.symbols.streamSym] as {
    write: (chunk: string) => void
  }
  const original = stream.write.bind(stream)
  stream.write = (chunk: string) => {
    lines.push(typeof chunk === "string" ? chunk : String(chunk))
    return original(chunk)
  }
  return lines
}

async function flush(logger: Logger): Promise<void> {
  await new Promise<void>((resolveFlush) => {
    logger.flush(() => {
      resolveFlush()
    })
  })
}

function parseLines(lines: string[]): Record<string, unknown>[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe("createLogger", () => {
  it("returns one cached logger per service and writes JSON with service metadata", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const service = `emailhub-test-${crypto.randomUUID()}`
    const logger = createLogger({ service })
    expect(createLogger({ service })).toBe(logger)

    const lines = capture(logger)
    logger.info(
      { event: "logger.ready", campaign_id: "camp-1" },
      "Logger ready"
    )
    await flush(logger)

    const records = parseLines(lines)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      level: "info",
      service,
      environment: "dev",
      event: "logger.ready",
      campaign_id: "camp-1",
      msg: "Logger ready",
    })
    expect(typeof records[0]?.time).toBe("string")
  })

  it("honors log level and keeps a child request id", async () => {
    process.env.LOG_LEVEL = "error"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const logger = createLogger({
      service: `emailhub-level-${crypto.randomUUID()}`,
    })
    const lines = capture(logger)
    const child = logger.child({ request_id: "req-child" })
    child.info({ event: "skipped" }, "not emitted")
    child.error({ event: "failed", error_code: "internal" }, "emitted")
    await flush(logger)

    const records = parseLines(lines)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      level: "error",
      request_id: "req-child",
      event: "failed",
      error_code: "internal",
    })
  })

  it("serializes errors without copying extra properties and scrubs URL userinfo", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const error = new Error(
      "connect postgresql://emailhub_app:synthetic-db-password@127.0.0.1:5432/emailhub failed"
    ) as Error & { password: string; code: string }
    error.password = SECRET
    error.code = "ECONNREFUSED"
    error.cause = new Error("redis://:synthetic-redis-password@127.0.0.1:6379")

    const logger = createLogger({
      service: `emailhub-err-${crypto.randomUUID()}`,
    })
    const lines = capture(logger)
    logger.error({ event: "db.failed", err: error }, "database failed")
    await flush(logger)

    const text = lines.join("\n")
    expect(text).not.toContain(SECRET)
    expect(text).not.toContain("synthetic-db-password")
    expect(text).not.toContain("synthetic-redis-password")
    expect(text).toContain("[REDACTED]")
    expect(text).toContain("ECONNREFUSED")

    const direct = serializeError(error)
    expect(direct.error_code).toBe("ECONNREFUSED")
    expect(JSON.stringify(direct)).not.toContain(SECRET)
  })

  it("omits stacks when EMAILHUB_ENV is prod", () => {
    process.env.EMAILHUB_ENV = "prod"
    process.env.NODE_ENV = "test"
    const serialized = serializeError(new Error("boom"))
    expect(serialized.stack).toBeUndefined()
    expect(serialized.message).toBe("boom")
  })

  it("forces JSON when production even if LOG_FORMAT is pretty", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "pretty"
    process.env.EMAILHUB_ENV = "prod"
    process.env.NODE_ENV = "production"

    const logger = createLogger({
      service: `emailhub-prod-${crypto.randomUUID()}`,
    })
    const lines = capture(logger)
    logger.info({ event: "prod.line" }, "production line")
    await flush(logger)

    expect(lines.some((line) => line.trim().startsWith("{"))).toBe(true)
    const record = parseLines(lines)[0]
    expect(record).toMatchObject({
      level: "info",
      environment: "prod",
      event: "prod.line",
    })
  })
})

describe("redaction", () => {
  it("censors configured secrets and leaves safe fields readable", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const logger = createLogger({
      service: `emailhub-redact-${crypto.randomUUID()}`,
    })
    const lines = capture(logger)
    logger.info(
      {
        event: "security.check",
        campaign_id: "camp-safe",
        password: SECRET,
        confirmPassword: "synthetic-confirm",
        accessToken: TOKEN,
        refreshToken: REFRESH,
        cookie: COOKIE,
        smtpPassword: SMTP_SECRET,
        DATABASE_URL: `postgresql://emailhub_app:${DB_SECRET}@127.0.0.1/emailhub`,
        AWS_SECRET_ACCESS_KEY: AWS_SECRET,
        html: `<p>${HTML}</p>`,
        text: "synthetic-text-body",
        unsubscribeToken: UNSUB,
        user: {
          name: "safe-name",
          password: SECRET,
          headers: {
            authorization: "Bearer synthetic-authorization",
            "x-request-id": "req-safe",
          },
        },
        nested: {
          refresh_token: REFRESH,
          apiSecret: "synthetic-api-secret",
        },
      },
      "redaction check"
    )
    await flush(logger)

    const text = lines.join("\n")
    for (const secret of [
      SECRET,
      "synthetic-confirm",
      TOKEN,
      REFRESH,
      COOKIE,
      SMTP_SECRET,
      DB_SECRET,
      AWS_SECRET,
      HTML,
      "synthetic-text-body",
      UNSUB,
      "synthetic-authorization",
      "synthetic-api-secret",
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain("[REDACTED]")
    expect(text).toContain("camp-safe")
    expect(text).toContain("safe-name")
    expect(text).toContain("req-safe")
    expect(text).toContain("security.check")
  })

  it("does not scrub a secret that is only present in the free-text message", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const logger = createLogger({
      service: `emailhub-freetext-${crypto.randomUUID()}`,
    })
    const lines = capture(logger)
    logger.info(
      {
        event: "note",
        detail: "postgresql://app:synthetic-note-password@db/app",
      },
      "leaked synthetic-message-secret"
    )
    await flush(logger)

    const text = lines.join("\n")
    expect(text).toContain("synthetic-message-secret")
    expect(text).toContain("synthetic-note-password")
  })
})

describe("maskEmail", () => {
  it("masks a normal address and keeps the original out of the result", () => {
    const masked = maskEmail("alexanderson@example.com")
    expect(masked).toBe("a***@example.com")
    expect(masked).not.toContain("alexanderson")
  })

  it("masks short local parts, empty values, malformed input, and unicode", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com")
    expect(maskEmail("ab@example.com")).toBe("a***@example.com")
    expect(maskEmail("")).toBe("")
    expect(maskEmail("   ")).toBe("")
    expect(maskEmail("not-an-email")).toBe("[invalid-email]")
    expect(maskEmail("@example.com")).toBe("[invalid-email]")
    expect(maskEmail("local@")).toBe("[invalid-email]")
    expect(maskEmail("álex@example.com")).toBe("á***@example.com")
    expect(maskEmail("álex@example.com")).not.toContain("álex")
  })
})

describe("request ids and context", () => {
  it("accepts a valid id and replaces empty, invalid, and oversized ids", () => {
    expect(isValidRequestId("req-123")).toBe(true)
    expect(resolveRequestId("req-123")).toBe("req-123")
    expect(resolveRequestId("  req-123  ")).toBe("req-123")

    const generated = resolveRequestId(null)
    expect(generated).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    expect(resolveRequestId("bad id")).not.toBe("bad id")
    expect(resolveRequestId(`a${"b".repeat(128)}`)).not.toContain("bbb")
    expect(resolveRequestId("../etc/passwd")).not.toBe("../etc/passwd")
  })

  it("keeps request ids isolated across concurrent async contexts", async () => {
    const seen: string[] = []
    await Promise.all([
      runWithRequestContext("req-a", async () => {
        await new Promise((resolveWait) => setTimeout(resolveWait, 30))
        seen.push(`a:${getRequestId() ?? ""}`)
        getContextLogger().info({ event: "context.a" }, "context a")
      }),
      runWithRequestContext("req-b", async () => {
        await new Promise((resolveWait) => setTimeout(resolveWait, 5))
        seen.push(`b:${getRequestId() ?? ""}`)
      }),
    ])

    expect(seen).toContain("a:req-a")
    expect(seen).toContain("b:req-b")
    expect(getRequestId()).toBeUndefined()
    expect(getContextLogger()).toBeDefined()
  })

  it("reads only safe job correlation fields", () => {
    expect(
      readJobCorrelation({
        message_id: "msg-1",
        request_id: "req-1",
        workspace_id: "ws-1",
        password: SECRET,
      })
    ).toEqual({
      requestId: "req-1",
      messageId: "msg-1",
      workspaceId: "ws-1",
    })
    expect(readJobCorrelation({ message_id: "msg-1" })).toEqual({
      messageId: "msg-1",
    })
    expect(readJobCorrelation({ request_id: "bad id" })).toEqual({})
    expect(readJobCorrelation(null)).toEqual({})
  })

  it("keeps the edge request-id module free of Node and Pino imports", () => {
    const source = readFileSync(
      resolve(fileURLToPath(new URL(".", import.meta.url)), "request-id.ts"),
      "utf8"
    )
    expect(source).not.toMatch(/from ["']node:/)
    expect(source).not.toMatch(/from ["']pino["']/)
    expect(source).toContain("crypto.randomUUID()")
  })
})

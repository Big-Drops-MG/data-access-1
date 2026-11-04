import pino, { type Logger } from "pino"

import { serializeError } from "./errors.js"
import { REDACT_CENSOR, REDACT_PATHS } from "./redaction.js"
import { isValidRequestId } from "./request-id.js"
import type { JobCorrelation } from "./types.js"

export type AppLogger = Logger

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const

type LogLevel = (typeof LOG_LEVELS)[number]

const loggers = new Map<string, AppLogger>()

function resolveLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase()
  if (value && (LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel
  }
  return "info"
}

function resolveEnvironment(): string {
  const hub = process.env.EMAILHUB_ENV?.trim()
  if (hub) {
    return hub
  }
  const nodeEnv = process.env.NODE_ENV?.trim()
  if (nodeEnv) {
    return nodeEnv
  }
  return "development"
}

function resolveLogFormat(): "json" | "pretty" {
  if (
    process.env.EMAILHUB_ENV === "prod" ||
    process.env.NODE_ENV === "production"
  ) {
    return "json"
  }
  return process.env.LOG_FORMAT === "pretty" ? "pretty" : "json"
}

function prettyStream(): { write: (chunk: string) => void } {
  return {
    write(chunk: string): void {
      const line = chunk.endsWith("\n") ? chunk.slice(0, -1) : chunk
      try {
        const record = JSON.parse(line) as Record<string, unknown>
        const time = typeof record.time === "string" ? record.time : ""
        const level = typeof record.level === "string" ? record.level : ""
        const msg = typeof record.msg === "string" ? record.msg : ""
        const rest: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(record)) {
          if (
            key === "time" ||
            key === "level" ||
            key === "msg" ||
            key === "pid" ||
            key === "hostname"
          ) {
            continue
          }
          rest[key] = value
        }
        process.stdout.write(
          `${time} ${level} ${msg} ${JSON.stringify(rest)}\n`
        )
      } catch {
        process.stdout.write(chunk.endsWith("\n") ? chunk : `${chunk}\n`)
      }
    },
  }
}

export function createLogger(options: { service: string }): AppLogger {
  const existing = loggers.get(options.service)
  if (existing) {
    return existing
  }

  const optionsForPino = {
    level: resolveLogLevel(),
    base: {
      service: options.service,
      environment: resolveEnvironment(),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label }
      },
    },
    redact: {
      paths: REDACT_PATHS,
      censor: REDACT_CENSOR,
    },
    serializers: {
      err: (error: unknown) => serializeError(error),
    },
  }

  const logger =
    resolveLogFormat() === "pretty"
      ? pino(optionsForPino, prettyStream())
      : pino(optionsForPino)

  loggers.set(options.service, logger)
  return logger
}

export function readJobCorrelation(data: unknown): JobCorrelation {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {}
  }

  const record = data as Record<string, unknown>
  const requestId =
    typeof record.request_id === "string" && isValidRequestId(record.request_id)
      ? record.request_id
      : undefined
  const messageId =
    typeof record.message_id === "string" &&
    record.message_id.length > 0 &&
    record.message_id.length <= 128
      ? record.message_id
      : undefined
  const workspaceId =
    typeof record.workspace_id === "string" &&
    record.workspace_id.length > 0 &&
    record.workspace_id.length <= 128
      ? record.workspace_id
      : undefined

  return { requestId, messageId, workspaceId }
}

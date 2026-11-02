import { auditLog, type AuditLog } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

import { maskEmail } from "./email.js"
import { AppError, isAppError } from "./errors.js"

const SECRET_KEY =
  /password|secret|apikey|privatekey|passphrase|authorization|cookie|token|backupcodes|emailbody|html|bodytext|rawemail|textbody/

const EMAIL_KEY =
  /^(email|from_email|fromEmail|reply_to|replyTo|recipient_email|recipientEmail|to_email|toEmail)$/i

const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ACTOR_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type AuditActorType = "user" | "api_client" | "system"

export type AuditActor = {
  type: AuditActorType
  id?: string | null
}

export type WriteAuditInput = {
  actor: AuditActor
  action: string
  objectType: string
  objectId?: string | null
  requestId?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
  userAgent?: string | null
}

function canonicalKey(key: string): string {
  return key.toLowerCase().replaceAll("_", "").replaceAll("-", "")
}

function isSecretKey(key: string): boolean {
  const canonical = canonicalKey(key)
  if (canonical.endsWith("hash") && !/password|secret/.test(canonical)) {
    return false
  }
  return SECRET_KEY.test(canonical)
}

function redactString(key: string | null, value: string): string {
  const trimmed = value.trim()
  if ((key !== null && EMAIL_KEY.test(key)) || EMAIL_VALUE.test(trimmed)) {
    return maskEmail(trimmed)
  }
  return value.replace(/[^\s@<>,"']+@[^\s@<>,"']+\.[^\s@<>,"']+/g, (match) =>
    maskEmail(match)
  )
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function redactAuditPayload(value: unknown, path: string): unknown {
  return walk(value, null, path, new WeakSet())
}

function walk(
  value: unknown,
  key: string | null,
  path: string,
  seen: WeakSet<object>
): unknown {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string") {
    return redactString(key, value)
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw AppError.validationFailed([{ path, message: "Circular value" }])
    }
    seen.add(value)
    try {
      return value.map((entry) => walk(entry, null, path, seen))
    } finally {
      seen.delete(value)
    }
  }
  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      return null
    }
    if (seen.has(value)) {
      throw AppError.validationFailed([{ path, message: "Circular value" }])
    }
    seen.add(value)
    try {
      const out: Record<string, unknown> = {}
      for (const [childKey, childValue] of Object.entries(value)) {
        if (isSecretKey(childKey) || childValue === undefined) {
          continue
        }
        out[childKey] = walk(childValue, childKey, path, seen)
      }
      return out
    } finally {
      seen.delete(value)
    }
  }
  return null
}

function collectSecrets(
  value: unknown,
  found: Set<string>,
  seen: WeakSet<object>
): void {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (EMAIL_VALUE.test(trimmed)) {
      found.add(trimmed)
    }
    return
  }
  if (!value || typeof value !== "object" || seen.has(value)) {
    return
  }
  seen.add(value)
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectSecrets(entry, found, seen)
    }
    return
  }
  if (!isPlainObject(value)) {
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key) && typeof child === "string" && child.length >= 4) {
      found.add(child)
    }
    collectSecrets(child, found, seen)
  }
}

function sanitizeAuditFailure(error: unknown, secrets: Set<string>): Error {
  if (isAppError(error)) {
    return error
  }
  const message = error instanceof Error ? error.message : ""
  const leaked = [...secrets].some(
    (secret) => secret.length >= 4 && message.includes(secret)
  )
  if (leaked) {
    return AppError.internal()
  }
  return error instanceof Error ? error : AppError.internal()
}

function requiredText(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw AppError.validationFailed([{ path, message: "Required" }])
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw AppError.validationFailed([{ path, message: "Required" }])
  }
  return trimmed
}

function optionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveActor(actor: AuditActor): {
  actorType: AuditActorType
  actorId: string | null
} {
  if (!actor || typeof actor !== "object") {
    throw AppError.validationFailed([{ path: "actor", message: "Required" }])
  }
  if (actor.type === "system") {
    if (optionalText(actor.id) !== null) {
      throw AppError.validationFailed([
        { path: "actor.id", message: "Must be empty" },
      ])
    }
    return { actorType: "system", actorId: null }
  }
  if (actor.type !== "user" && actor.type !== "api_client") {
    throw AppError.validationFailed([
      { path: "actor.type", message: "Invalid" },
    ])
  }
  const actorId = optionalText(actor.id)?.toLowerCase() ?? ""
  if (!ACTOR_UUID.test(actorId)) {
    throw AppError.validationFailed([{ path: "actor.id", message: "Invalid" }])
  }
  return { actorType: actor.type, actorId }
}

export async function writeAudit(
  db: Database | DatabaseTransaction,
  input: WriteAuditInput
): Promise<AuditLog> {
  const { actorType, actorId } = resolveActor(input.actor)
  const secrets = new Set<string>()
  collectSecrets(input.before, secrets, new WeakSet())
  collectSecrets(input.after, secrets, new WeakSet())

  try {
    const [row] = await db
      .insert(auditLog)
      .values({
        actorType,
        actorId,
        action: requiredText(input.action, "action"),
        entityType: requiredText(input.objectType, "objectType"),
        entityId: optionalText(input.objectId),
        requestId: optionalText(input.requestId),
        before: redactAuditPayload(input.before, "before"),
        after: redactAuditPayload(input.after, "after"),
        ip: optionalText(input.ip),
        userAgent: optionalText(input.userAgent),
      })
      .returning()

    if (!row) {
      throw AppError.internal()
    }
    return row
  } catch (error) {
    throw sanitizeAuditFailure(error, secrets)
  }
}

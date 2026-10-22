import { message, recipient } from "@workspace/db"
import type { Message, Recipient } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"
import { eq, sql } from "drizzle-orm"

import { hashEmail, normaliseEmail } from "./email.js"
import { AppError } from "./errors.js"
import { emailSchema } from "./schemas.js"

export type EmailHubDb = Database
export type EmailHubTx = DatabaseTransaction

export type TriggerEmailInput = {
  email: string
  idempotencyKey: string
  externalUserId?: string | null
}

export type TriggerEmailCreateContext = {
  tx: EmailHubTx
  recipient: Recipient
  idempotencyKey: string
  email: string
  externalUserId: string | null
}

export type TriggerEmailResult = {
  message: Message
  recipient: Recipient
  /** False when an existing row for `idempotencyKey` was returned. */
  created: boolean
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  )
}

/**
 * Find or create a recipient by normalised email (SD#7 Stage A step 2).
 * Concurrent inserts race on the unique email index and re-select.
 */
export async function findOrCreateRecipient(
  db: EmailHubDb | EmailHubTx,
  email: string,
  externalUserId?: string | null
): Promise<Recipient> {
  const normalised = normaliseEmail(email)
  const parsed = emailSchema.safeParse(normalised)
  if (!parsed.success) {
    throw new AppError(
      "validation_failed",
      422,
      parsed.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join(".") : "email",
        message: issue.message,
      }))
    )
  }

  const existing = await db
    .select()
    .from(recipient)
    .where(eq(recipient.email, normalised))
    .limit(1)

  if (existing[0]) {
    return existing[0]
  }

  const emailHash = hashEmail(normalised)
  try {
    const [created] = await db
      .insert(recipient)
      .values({
        email: normalised,
        emailHash,
        externalUserId: externalUserId ?? null,
      })
      .returning()
    if (!created) {
      throw new AppError("internal")
    }
    return created
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error
    }
    const raced = await db
      .select()
      .from(recipient)
      .where(eq(recipient.email, normalised))
      .limit(1)
    if (!raced[0]) {
      throw new AppError("internal")
    }
    return raced[0]
  }
}

/** Per-recipient transaction lock (SD#7 Stage A step 3). */
export async function lockRecipientTx(
  tx: EmailHubTx,
  recipientId: string
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${recipientId}::text))`
  )
}

/**
 * Stage A steps 2–4 (SD#7): normalise email, find/create recipient, open a
 * transaction, take `pg_advisory_xact_lock` per recipient, return an existing
 * message for a used `idempotency_key`, otherwise call `createMessage` in the
 * same transaction (later Stage A steps / T-029+).
 */
export async function triggerEmail(
  db: EmailHubDb,
  input: TriggerEmailInput,
  createMessage: (ctx: TriggerEmailCreateContext) => Promise<Message>
): Promise<TriggerEmailResult> {
  const idempotencyKey = input.idempotencyKey.trim()
  if (!idempotencyKey) {
    throw new AppError("validation_failed", 422, [
      { path: "idempotency_key", message: "Required" },
    ])
  }

  const externalUserId = input.externalUserId ?? null
  const foundRecipient = await findOrCreateRecipient(
    db,
    input.email,
    externalUserId
  )
  const email = foundRecipient.email

  return db.transaction(async (tx) => {
    await lockRecipientTx(tx, foundRecipient.id)

    const existing = await tx
      .select()
      .from(message)
      .where(eq(message.idempotencyKey, idempotencyKey))
      .limit(1)

    if (existing[0]) {
      return {
        message: existing[0],
        recipient: foundRecipient,
        created: false,
      }
    }

    const created = await createMessage({
      tx,
      recipient: foundRecipient,
      idempotencyKey,
      email,
      externalUserId,
    })

    return {
      message: created,
      recipient: foundRecipient,
      created: true,
    }
  })
}

import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"

import { parse } from "csv-parse"
import { eq } from "drizzle-orm"

import { recipient } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

import { emailSchema } from "./schemas.js"
import { hashEmail, normaliseEmail } from "./email.js"

export const RECIPIENT_IMPORT_CHUNK_SIZE = 5_000
export const RECIPIENT_IMPORT_MAX_BYTES = 50 * 1024 * 1024
export const DEFAULT_RECIPIENT_IMPORTS_DIR = "/data/imports"

export type RecipientImportCounts = {
  rows_read: number
  added: number
  updated: number
  skipped: number
  invalid: number
}

export type RecipientImportRow = {
  email: string
  /** `undefined` = CSV had no external_user_id column (leave existing alone). */
  externalUserId?: string | null
}

type Db = Database | DatabaseTransaction

export function recipientImportsDir(
  envValue: string | undefined = process.env.RECIPIENT_IMPORTS_DIR
): string {
  const trimmed = envValue?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_RECIPIENT_IMPORTS_DIR
}

export function resolveEmailColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => header.trim().toLowerCase() === "email")
}

export function resolveExternalUserIdColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => {
    const key = header
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_")
    return key === "external_user_id" || key === "external_userid"
  })
}

/** Peek CSV header line; throws if missing `email` column. */
export async function assertCsvHasEmailColumn(filePath: string): Promise<void> {
  const stream = createReadStream(filePath, { encoding: "utf8" })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (line.trim().length === 0) {
        continue
      }
      const headers = await parseCsvLine(line)
      if (resolveEmailColumnIndex(headers) < 0) {
        throw new Error("CSV must include an email column")
      }
      return
    }
    throw new Error("CSV must include an email column")
  } finally {
    rl.close()
    stream.destroy()
  }
}

function parseCsvLine(line: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    parse(line, { relax_column_count: true, trim: true }, (error, records) => {
      if (error) {
        reject(error)
        return
      }
      const row = records?.[0]
      resolve(Array.isArray(row) ? row.map(String) : [])
    })
  })
}

export function normalizeImportEmail(
  raw: string
): { ok: true; email: string } | { ok: false } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false }
  }
  const normalised = normaliseEmail(trimmed)
  const parsed = emailSchema.safeParse(normalised)
  if (!parsed.success) {
    return { ok: false }
  }
  return { ok: true, email: parsed.data }
}

/**
 * Collapse file rows so the last occurrence of each email wins.
 * Returns unique rows plus skip/invalid counts from the raw row stream.
 */
export function collapseImportRows(
  rows: Array<{
    emailRaw: string
    externalUserIdRaw?: string | null
    hasExternalColumn?: boolean
  }>
): {
  unique: RecipientImportRow[]
  skipped: number
  invalid: number
} {
  const byEmail = new Map<string, RecipientImportRow>()
  let skipped = 0
  let invalid = 0

  for (const row of rows) {
    const normalised = normalizeImportEmail(row.emailRaw)
    if (!normalised.ok) {
      invalid += 1
      continue
    }
    if (byEmail.has(normalised.email)) {
      skipped += 1
    }
    const next: RecipientImportRow = { email: normalised.email }
    if (row.hasExternalColumn) {
      const trimmed = row.externalUserIdRaw?.trim() ?? ""
      next.externalUserId = trimmed.length > 0 ? trimmed : null
    }
    byEmail.set(normalised.email, next)
  }

  return { unique: [...byEmail.values()], skipped, invalid }
}

export async function upsertRecipientBatch(
  db: Db,
  rows: RecipientImportRow[]
): Promise<{ added: number; updated: number }> {
  let added = 0
  let updated = 0

  for (const row of rows) {
    const emailHash = hashEmail(row.email)
    const existing = await db
      .select({ id: recipient.id })
      .from(recipient)
      .where(eq(recipient.email, row.email))
      .limit(1)

    if (existing[0]) {
      const patch: {
        emailHash: string
        updatedAt: Date
        externalUserId?: string | null
      } = {
        emailHash,
        updatedAt: new Date(),
      }
      if (row.externalUserId !== undefined) {
        patch.externalUserId = row.externalUserId
      }
      await db
        .update(recipient)
        .set(patch)
        .where(eq(recipient.id, existing[0].id))
      updated += 1
    } else {
      await db.insert(recipient).values({
        email: row.email,
        emailHash,
        externalUserId:
          row.externalUserId === undefined ? null : row.externalUserId,
      })
      added += 1
    }
  }

  return { added, updated }
}

/** Stream-parse CSV and upsert in 5000-row unique chunks (after last-wins collapse per chunk). */
export async function ingestRecipientCsvFile(
  db: Db,
  filePath: string,
  options: { chunkSize?: number } = {}
): Promise<RecipientImportCounts> {
  const chunkSize = options.chunkSize ?? RECIPIENT_IMPORT_CHUNK_SIZE
  const counts: RecipientImportCounts = {
    rows_read: 0,
    added: 0,
    updated: 0,
    skipped: 0,
    invalid: 0,
  }

  // Global last-wins across the whole file
  const byEmail = new Map<string, RecipientImportRow>()
  let headers: string[] | null = null
  let emailIdx = -1
  let externalIdx = -1

  const parser = createReadStream(filePath).pipe(
    parse({
      relax_column_count: true,
      trim: true,
      skip_empty_lines: true,
      bom: true,
    })
  )

  for await (const record of parser) {
    const cells = (record as string[]).map((cell) => String(cell ?? ""))
    if (!headers) {
      headers = cells
      emailIdx = resolveEmailColumnIndex(headers)
      externalIdx = resolveExternalUserIdColumnIndex(headers)
      if (emailIdx < 0) {
        throw new Error("CSV must include an email column")
      }
      continue
    }

    counts.rows_read += 1
    const emailRaw = cells[emailIdx] ?? ""
    const normalised = normalizeImportEmail(emailRaw)
    if (!normalised.ok) {
      counts.invalid += 1
      continue
    }
    if (byEmail.has(normalised.email)) {
      counts.skipped += 1
    }
    const next: RecipientImportRow = { email: normalised.email }
    if (externalIdx >= 0) {
      const externalRaw = (cells[externalIdx] ?? "").trim()
      next.externalUserId = externalRaw.length > 0 ? externalRaw : null
    }
    byEmail.set(normalised.email, next)
  }

  const unique = [...byEmail.values()]
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    const result = await upsertRecipientBatch(db, chunk)
    counts.added += result.added
    counts.updated += result.updated
  }

  return counts
}

/** Used by unit tests without touching the filesystem. */
export async function ingestRecipientRows(
  db: Db,
  rows: Array<{ emailRaw: string; externalUserIdRaw?: string | null }>,
  options: { chunkSize?: number } = {}
): Promise<RecipientImportCounts> {
  const hasExternalColumn = rows.some(
    (row) => row.externalUserIdRaw !== undefined
  )
  const collapsed = collapseImportRows(
    rows.map((row) => ({
      emailRaw: row.emailRaw,
      externalUserIdRaw: row.externalUserIdRaw ?? null,
      hasExternalColumn,
    }))
  )
  const chunkSize = options.chunkSize ?? RECIPIENT_IMPORT_CHUNK_SIZE
  const counts: RecipientImportCounts = {
    rows_read: rows.length,
    added: 0,
    updated: 0,
    skipped: collapsed.skipped,
    invalid: collapsed.invalid,
  }
  for (let i = 0; i < collapsed.unique.length; i += chunkSize) {
    const chunk = collapsed.unique.slice(i, i + chunkSize)
    const result = await upsertRecipientBatch(db, chunk)
    counts.added += result.added
    counts.updated += result.updated
  }
  return counts
}

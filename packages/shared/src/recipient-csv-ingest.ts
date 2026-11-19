import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"

import { parse } from "csv-parse"
import { eq, or } from "drizzle-orm"

import { offer, recipient } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

import { emailSchema, uuidSchema } from "./schemas.js"
import { hashEmail, normaliseEmail } from "./email.js"

export const RECIPIENT_IMPORT_CHUNK_SIZE = 5_000
export const RECIPIENT_IMPORT_MAX_BYTES = 50 * 1024 * 1024
export const DEFAULT_RECIPIENT_IMPORTS_DIR = "/data/imports"
export const RECIPIENT_IMPORT_INVALID_SAMPLE_LIMIT = 25
export const RECIPIENT_IMPORT_FIRST_NAME_MAX = 100
export const RECIPIENT_IMPORT_LAST_NAME_MAX = 100
export const RECIPIENT_IMPORT_OFFER_ID_MAX = 128
export const RECIPIENT_IMPORT_EXTERNAL_USER_ID_MAX = 128

/** Allowed CSV headers (case/spacing insensitive after normalisation). */
export const RECIPIENT_IMPORT_ALLOWED_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "offer_id",
  "external_user_id",
] as const

export type RecipientImportAllowedColumn =
  (typeof RECIPIENT_IMPORT_ALLOWED_COLUMNS)[number]

export type RecipientImportInvalidRow = {
  row: number
  column: string
  problem: string
}

export type RecipientImportCounts = {
  rows_read: number
  added: number
  updated: number
  skipped: number
  invalid: number
  invalid_rows: RecipientImportInvalidRow[]
}

export type RecipientImportRow = {
  email: string
  /** `undefined` = CSV had no first_name column (leave existing alone). */
  firstName?: string | null
  /** `undefined` = CSV had no last_name column (leave existing alone). */
  lastName?: string | null
  /** `undefined` = CSV had no external_user_id column (leave existing alone). */
  externalUserId?: string | null
}

export type RecipientImportColumnMap = {
  email: number
  first_name: number | null
  last_name: number | null
  offer_id: number | null
  external_user_id: number | null
}

export type RecipientImportHeaderValidation =
  | {
      ok: true
      columns: RecipientImportColumnMap
      recognised: RecipientImportAllowedColumn[]
    }
  | {
      ok: false
      missing_required: string[]
      unknown_columns: string[]
      duplicate_columns: string[]
    }

type Db = Database | DatabaseTransaction

export function recipientImportsDir(
  envValue: string | undefined = process.env.RECIPIENT_IMPORTS_DIR
): string {
  const trimmed = envValue?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_RECIPIENT_IMPORTS_DIR
}

export function normalizeImportHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

export function resolveEmailColumnIndex(headers: string[]): number {
  return headers.findIndex(
    (header) => normalizeImportHeader(header) === "email"
  )
}

export function resolveExternalUserIdColumnIndex(headers: string[]): number {
  return headers.findIndex((header) => {
    const key = normalizeImportHeader(header)
    return key === "external_user_id" || key === "external_userid"
  })
}

export function validateImportHeaders(
  headers: string[]
): RecipientImportHeaderValidation {
  const normalised = headers.map((header) => normalizeImportHeader(header))
  const seen = new Map<string, number>()
  const duplicate_columns: string[] = []
  const unknown_columns: string[] = []

  for (let i = 0; i < normalised.length; i += 1) {
    const key = normalised[i] ?? ""
    if (!key) {
      unknown_columns.push(headers[i]?.trim() || `(empty column ${i + 1})`)
      continue
    }
    const prior = seen.get(key)
    if (prior != null) {
      if (!duplicate_columns.includes(key)) {
        duplicate_columns.push(key)
      }
      continue
    }
    seen.set(key, i)
    const allowed =
      key === "external_userid"
        ? "external_user_id"
        : (RECIPIENT_IMPORT_ALLOWED_COLUMNS as readonly string[]).includes(key)
          ? (key as RecipientImportAllowedColumn)
          : null
    if (!allowed) {
      unknown_columns.push(headers[i]?.trim() || key)
    }
  }

  const email = seen.get("email")
  const missing_required = email == null ? ["email"] : []
  if (
    missing_required.length > 0 ||
    unknown_columns.length > 0 ||
    duplicate_columns.length > 0
  ) {
    return {
      ok: false,
      missing_required,
      unknown_columns,
      duplicate_columns,
    }
  }

  const external =
    seen.get("external_user_id") ?? seen.get("external_userid") ?? null
  const recognised = RECIPIENT_IMPORT_ALLOWED_COLUMNS.filter((column) => {
    if (column === "external_user_id") {
      return external != null
    }
    return seen.has(column)
  })

  return {
    ok: true,
    columns: {
      email: email!,
      first_name: seen.get("first_name") ?? null,
      last_name: seen.get("last_name") ?? null,
      offer_id: seen.get("offer_id") ?? null,
      external_user_id: external,
    },
    recognised,
  }
}

/**
 * Reject binary / Excel workbooks and other non-text payloads before enqueue.
 * CSV-only import (US-29); Excel must be exported to CSV first.
 */
export function assertSafeRecipientImportBytes(buffer: Buffer): void {
  if (buffer.length <= 0) {
    throw new Error("File is empty")
  }
  if (buffer.length > RECIPIENT_IMPORT_MAX_BYTES) {
    throw new Error(
      `File must be at most ${RECIPIENT_IMPORT_MAX_BYTES} bytes (50 MB)`
    )
  }
  if (buffer.includes(0)) {
    throw new Error("File contains binary null bytes and is not a valid CSV")
  }
  // ZIP local header — typical of .xlsx
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    throw new Error(
      "Excel .xlsx files are not supported. Export the sheet as CSV and try again."
    )
  }
  // OLE Compound File — typical of legacy .xls
  if (
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    throw new Error(
      "Excel .xls files are not supported. Export the sheet as CSV and try again."
    )
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
  let control = 0
  for (const byte of sample) {
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue
    }
    if (byte < 0x20) {
      control += 1
    }
  }
  if (sample.length > 0 && control / sample.length > 0.02) {
    throw new Error("File does not look like a text CSV")
  }
}

export function assertSafeUploadFilename(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error("File name is required")
  }
  if (trimmed.length > 255) {
    throw new Error("File name is too long")
  }
  if (
    trimmed.includes("\0") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..")
  ) {
    throw new Error("Invalid file name")
  }
  if (!trimmed.toLowerCase().endsWith(".csv")) {
    throw new Error("Only .csv files are accepted")
  }
  const lower = trimmed.toLowerCase()
  if (lower.endsWith(".xlsx.csv") || lower.endsWith(".xls.csv")) {
    throw new Error(
      "Excel workbooks are not accepted. Export as a plain CSV file."
    )
  }
}

export function looksLikeSpreadsheetFormula(value: string): boolean {
  const trimmed = value.trimStart()
  if (!trimmed) {
    return false
  }
  const first = trimmed[0]
  return first === "=" || first === "+" || first === "-" || first === "@"
}

/** Peek CSV header line and validate allowed columns. */
export async function assertCsvImportHeaders(filePath: string): Promise<{
  recognised: RecipientImportAllowedColumn[]
}> {
  const stream = createReadStream(filePath, { encoding: "utf8" })
  const rl = createInterface({ input: stream, crlfDelay: Infinity })
  try {
    for await (const line of rl) {
      if (line.trim().length === 0) {
        continue
      }
      const headers = await parseCsvLine(line)
      const validation = validateImportHeaders(headers)
      if (!validation.ok) {
        throw new Error(headerValidationErrorMessage(validation))
      }
      return { recognised: validation.recognised }
    }
    throw new Error("CSV must include an email column")
  } finally {
    rl.close()
    stream.destroy()
  }
}

/** @deprecated Prefer assertCsvImportHeaders — kept for older call sites. */
export async function assertCsvHasEmailColumn(filePath: string): Promise<void> {
  await assertCsvImportHeaders(filePath)
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
): { ok: true; email: string } | { ok: false; problem: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: false, problem: "Empty" }
  }
  if (looksLikeSpreadsheetFormula(trimmed)) {
    return { ok: false, problem: "Looks like a spreadsheet formula" }
  }
  const normalised = normaliseEmail(trimmed)
  const parsed = emailSchema.safeParse(normalised)
  if (!parsed.success) {
    return {
      ok: false,
      problem: `"${trimmed}" is not a valid address`,
    }
  }
  return { ok: true, email: parsed.data }
}

function validateOptionalName(
  raw: string,
  max: number
): { ok: true; value: string | null } | { ok: false; problem: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: null }
  }
  if (looksLikeSpreadsheetFormula(trimmed)) {
    return { ok: false, problem: "Looks like a spreadsheet formula" }
  }
  if (trimmed.length > max) {
    return {
      ok: false,
      problem: `Exceeds ${max} characters`,
    }
  }
  return { ok: true, value: trimmed }
}

export function validateOptionalFirstName(
  raw: string
): { ok: true; value: string | null } | { ok: false; problem: string } {
  return validateOptionalName(raw, RECIPIENT_IMPORT_FIRST_NAME_MAX)
}

export function validateOptionalLastName(
  raw: string
): { ok: true; value: string | null } | { ok: false; problem: string } {
  return validateOptionalName(raw, RECIPIENT_IMPORT_LAST_NAME_MAX)
}

export function validateOptionalExternalUserId(
  raw: string
): { ok: true; value: string | null } | { ok: false; problem: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: null }
  }
  if (looksLikeSpreadsheetFormula(trimmed)) {
    return { ok: false, problem: "Looks like a spreadsheet formula" }
  }
  if (trimmed.length > RECIPIENT_IMPORT_EXTERNAL_USER_ID_MAX) {
    return {
      ok: false,
      problem: `Exceeds ${RECIPIENT_IMPORT_EXTERNAL_USER_ID_MAX} characters`,
    }
  }
  return { ok: true, value: trimmed }
}

export function validateOptionalOfferIdRaw(
  raw: string
): { ok: true; value: string | null } | { ok: false; problem: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { ok: true, value: null }
  }
  if (looksLikeSpreadsheetFormula(trimmed)) {
    return { ok: false, problem: "Looks like a spreadsheet formula" }
  }
  if (trimmed.length > RECIPIENT_IMPORT_OFFER_ID_MAX) {
    return {
      ok: false,
      problem: `Exceeds ${RECIPIENT_IMPORT_OFFER_ID_MAX} characters`,
    }
  }
  return { ok: true, value: trimmed }
}

async function offerReferenceExists(db: Db, raw: string): Promise<boolean> {
  const trimmed = raw.trim()
  const conditions = [eq(offer.externalRef, trimmed)]
  const asUuid = uuidSchema.safeParse(trimmed.toLowerCase())
  if (asUuid.success) {
    conditions.push(eq(offer.id, asUuid.data))
  }
  if (/^\d+$/.test(trimmed)) {
    const asInt = Number.parseInt(trimmed, 10)
    if (Number.isSafeInteger(asInt)) {
      conditions.push(eq(offer.everflowOfferId, asInt))
    }
  }
  const rows = await db
    .select({ id: offer.id })
    .from(offer)
    .where(or(...conditions))
    .limit(1)
  return rows.length > 0
}

function headerValidationErrorMessage(
  validation: Extract<RecipientImportHeaderValidation, { ok: false }>
): string {
  const parts: string[] = []
  if (validation.missing_required.length > 0) {
    parts.push(
      `Missing required column(s): ${validation.missing_required.join(", ")}`
    )
  }
  if (validation.unknown_columns.length > 0) {
    parts.push(
      `Unknown column(s): ${validation.unknown_columns.join(", ")}. Allowed: ${RECIPIENT_IMPORT_ALLOWED_COLUMNS.join(", ")}`
    )
  }
  if (validation.duplicate_columns.length > 0) {
    parts.push(
      `Duplicate column(s): ${validation.duplicate_columns.join(", ")}`
    )
  }
  return parts.join(". ")
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
        firstName?: string | null
        lastName?: string | null
        externalUserId?: string | null
      } = {
        emailHash,
        updatedAt: new Date(),
      }
      if (row.firstName !== undefined) {
        patch.firstName = row.firstName
      }
      if (row.lastName !== undefined) {
        patch.lastName = row.lastName
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
        firstName: row.firstName === undefined ? null : row.firstName,
        lastName: row.lastName === undefined ? null : row.lastName,
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
    invalid_rows: [],
  }

  // Global last-wins across the whole file
  const byEmail = new Map<string, RecipientImportRow>()
  let columns: RecipientImportColumnMap | null = null
  const offerCache = new Map<string, boolean>()
  /** 1-based data row number (header is not counted). */
  let dataRowNumber = 0

  const pushInvalid = (row: number, column: string, problem: string): void => {
    counts.invalid += 1
    if (counts.invalid_rows.length < RECIPIENT_IMPORT_INVALID_SAMPLE_LIMIT) {
      counts.invalid_rows.push({ row, column, problem })
    }
  }

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
    if (!columns) {
      const validation = validateImportHeaders(cells)
      if (!validation.ok) {
        throw new Error(headerValidationErrorMessage(validation))
      }
      columns = validation.columns
      continue
    }

    dataRowNumber += 1
    counts.rows_read += 1
    const emailRaw = cells[columns.email] ?? ""
    const normalised = normalizeImportEmail(emailRaw)
    if (!normalised.ok) {
      pushInvalid(dataRowNumber, "email", normalised.problem)
      continue
    }

    let firstNameValue: string | null | undefined
    if (columns.first_name != null) {
      const firstName = validateOptionalFirstName(
        cells[columns.first_name] ?? ""
      )
      if (!firstName.ok) {
        pushInvalid(dataRowNumber, "first_name", firstName.problem)
        continue
      }
      firstNameValue = firstName.value
    }

    let lastNameValue: string | null | undefined
    if (columns.last_name != null) {
      const lastName = validateOptionalLastName(cells[columns.last_name] ?? "")
      if (!lastName.ok) {
        pushInvalid(dataRowNumber, "last_name", lastName.problem)
        continue
      }
      lastNameValue = lastName.value
    }

    if (columns.offer_id != null) {
      const offerRaw = validateOptionalOfferIdRaw(cells[columns.offer_id] ?? "")
      if (!offerRaw.ok) {
        pushInvalid(dataRowNumber, "offer_id", offerRaw.problem)
        continue
      }
      if (offerRaw.value) {
        let exists = offerCache.get(offerRaw.value)
        if (exists === undefined) {
          exists = await offerReferenceExists(db, offerRaw.value)
          offerCache.set(offerRaw.value, exists)
        }
        if (!exists) {
          pushInvalid(
            dataRowNumber,
            "offer_id",
            `"${offerRaw.value}" doesn't exist`
          )
          continue
        }
      }
    }

    const next: RecipientImportRow = { email: normalised.email }
    if (firstNameValue !== undefined) {
      next.firstName = firstNameValue
    }
    if (lastNameValue !== undefined) {
      next.lastName = lastNameValue
    }
    if (columns.external_user_id != null) {
      const external = validateOptionalExternalUserId(
        cells[columns.external_user_id] ?? ""
      )
      if (!external.ok) {
        pushInvalid(dataRowNumber, "external_user_id", external.problem)
        continue
      }
      next.externalUserId = external.value
    }

    if (byEmail.has(normalised.email)) {
      counts.skipped += 1
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
    invalid_rows: [],
  }
  for (let i = 0; i < collapsed.unique.length; i += chunkSize) {
    const chunk = collapsed.unique.slice(i, i + chunkSize)
    const result = await upsertRecipientBatch(db, chunk)
    counts.added += result.added
    counts.updated += result.updated
  }
  return counts
}

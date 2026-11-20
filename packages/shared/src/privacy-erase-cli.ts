import { and, eq, isNull } from "drizzle-orm"

import { suppressionEntry } from "@workspace/db"
import { getDb, getPool } from "@workspace/db/client"

import { isAppError } from "./errors.js"
import { erasePrivacyData } from "./privacy.js"

function requireEmailArg(argv: string[]): string {
  const email = argv[2]?.trim()
  if (!email) {
    throw new Error("Usage: pnpm ops:privacy-erase -- <email>")
  }
  return email
}

const email = requireEmailArg(process.argv)

try {
  const db = getDb()
  const result = await erasePrivacyData(db, email)
  const [active] = await db
    .select({
      id: suppressionEntry.id,
      source: suppressionEntry.source,
      reason: suppressionEntry.reason,
    })
    .from(suppressionEntry)
    .where(
      and(
        eq(suppressionEntry.emailHash, result.email_hash),
        isNull(suppressionEntry.removedAt)
      )
    )
    .limit(1)

  if (!active) {
    throw new Error("Done When failed: erased address is not suppressed")
  }

  process.stdout.write(
    `${JSON.stringify({ ...result, active_suppression: active }, null, 2)}\n`
  )
} catch (error) {
  if (isAppError(error)) {
    process.stderr.write(`${error.message}\n`)
  } else {
    const message = error instanceof Error ? error.message : String(error)
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null
    process.stderr.write(cause ? `${message}\n${cause}\n` : `${message}\n`)
  }
  process.exitCode = 1
} finally {
  await getPool().end()
}

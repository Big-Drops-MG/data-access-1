import { getDb, getPool } from "@workspace/db/client"

import { isAppError } from "./errors.js"
import { exportPrivacyData } from "./privacy.js"

function requireEmailArg(argv: string[]): string {
  const email = argv[2]?.trim()
  if (!email) {
    throw new Error("Usage: pnpm ops:privacy-export -- <email>")
  }
  return email
}

const email = requireEmailArg(process.argv)

try {
  const payload = await exportPrivacyData(getDb(), email)
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
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

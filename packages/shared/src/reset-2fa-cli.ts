import { getDb, getPool } from "@workspace/db/client"

import { isAppError } from "./errors.js"
import { reset2faByEmail } from "./reset-2fa.js"

function requireEmailArg(argv: string[]): string {
  const email = argv[2]?.trim()
  if (!email) {
    throw new Error("Usage: pnpm ops:reset-2fa -- <email>")
  }
  return email
}

const email = requireEmailArg(process.argv)

try {
  const result = await reset2faByEmail(getDb(), email)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
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

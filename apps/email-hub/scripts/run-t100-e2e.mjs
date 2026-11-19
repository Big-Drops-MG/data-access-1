import { randomBytes } from "node:crypto"
import { spawn } from "node:child_process"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const appDir = fileURLToPath(new URL("..", import.meta.url))
const raw = fs.readFileSync(new URL("../.env", import.meta.url), "utf8")
const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
const file = {}
for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    continue
  }
  const eq = trimmed.indexOf("=")
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  file[key] = value
}

if (!file.DATABASE_URL || !file.DATABASE_MIGRATION_URL) {
  throw new Error("apps/email-hub/.env is missing database URLs.")
}
if (file.EMAILHUB_ENV && file.EMAILHUB_ENV !== "dev") {
  throw new Error("Refusing to start E2E when EMAILHUB_ENV is not dev.")
}

function withDatabase(connectionString, database) {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

const databaseName = "emailhub_e2e"
const secret = randomBytes(32).toString("base64url")
const totpSecret = randomBytes(24).toString("base64url")
const env = {
  ...process.env,
  ...file,
  E2E: "1",
  E2E_ENVIRONMENT: "local",
  E2E_DATABASE_NAME: databaseName,
  E2E_AUTH_SECRET: secret,
  E2E_TOTP_SECRET: totpSecret,
  E2E_LOGIN_EMAIL: "e2e-login@bigdropsmarketing.com",
  E2E_2FA_EMAIL: "e2e-2fa@bigdropsmarketing.com",
  E2E_LOCKOUT_EMAIL: "e2e-lockout@bigdropsmarketing.com",
  EMAILHUB_ENV: "dev",
  NODE_ENV: "development",
  BETTER_AUTH_URL: "http://127.0.0.1:3099",
  DATABASE_URL: withDatabase(file.DATABASE_URL, databaseName),
  DATABASE_MIGRATION_URL: withDatabase(
    file.DATABASE_MIGRATION_URL,
    databaseName
  ),
  PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3099",
}

const child = spawn(
  "pnpm",
  ["exec", "playwright", "test", "tests/e2e/auth.spec.ts"],
  {
    cwd: appDir,
    env,
    shell: true,
    stdio: "inherit",
  }
)

const code = await new Promise((resolve) => {
  child.on("exit", (exitCode) => resolve(exitCode ?? 1))
})
process.exit(code)

import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

export function recordWorkerDatabase(
  manifestDir: string,
  database: string
): void {
  fs.mkdirSync(manifestDir, { recursive: true })
  fs.writeFileSync(
    path.join(manifestDir, `${database}-${randomBytes(3).toString("hex")}.txt`),
    database,
    "utf8"
  )
}

export function assertDistinctWorkerDatabases(manifestDir: string): void {
  if (!manifestDir || !fs.existsSync(manifestDir)) {
    return
  }

  const names = fs
    .readdirSync(manifestDir)
    .map((file) => fs.readFileSync(path.join(manifestDir, file), "utf8").trim())
    .filter((name) => name.length > 0)
  if (names.length < 2) {
    return
  }

  if (new Set(names).size !== names.length) {
    throw new Error("Vitest workers shared a test database.")
  }
}

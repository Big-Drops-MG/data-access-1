import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { migrateClickHouse } from "./migrate.js"

const packageDir = fs.realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
)
const cwd = fs.realpathSync(process.cwd())

if (cwd.toLowerCase() !== packageDir.toLowerCase()) {
  throw new Error(
    "Run ClickHouse migrations from packages/db. Migration paths are relative to that package."
  )
}

const result = await migrateClickHouse()

if (result.applied.length === 0 && result.skipped.length === 0) {
  process.stdout.write(
    "ClickHouse: no migration files found; schema_migrations is ready.\n"
  )
} else {
  for (const filename of result.skipped) {
    process.stdout.write(`ClickHouse: already applied ${filename}\n`)
  }
  for (const filename of result.applied) {
    process.stdout.write(`ClickHouse: applied ${filename}\n`)
  }
}

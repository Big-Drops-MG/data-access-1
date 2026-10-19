import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { migrateClickHouse } from "./migrate.js"

const clickhouseUrl = process.env.CLICKHOUSE_URL?.trim()

describe.skipIf(!clickhouseUrl)("migrateClickHouse", () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("applies pending migrations and is idempotent", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-migrate-int-"))
    tempDirs.push(dir)
    const version = String(Date.now()).slice(-4).padStart(4, "0")
    const filename = `${version}_int_probe.sql`
    fs.writeFileSync(
      path.join(dir, filename),
      `CREATE TABLE IF NOT EXISTS emailhub.int_probe_${version} (id UInt8) ENGINE = Memory;`
    )

    const first = await migrateClickHouse({
      url: clickhouseUrl,
      migrationsDir: dir,
    })
    expect(first.applied).toContain(filename)

    const second = await migrateClickHouse({
      url: clickhouseUrl,
      migrationsDir: dir,
    })
    expect(second.applied).toEqual([])
    expect(second.skipped).toContain(filename)
  }, 30_000)
})

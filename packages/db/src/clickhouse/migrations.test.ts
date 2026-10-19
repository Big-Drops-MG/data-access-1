import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  checksumSql,
  listClickHouseMigrationFiles,
  splitSqlStatements,
} from "./migrations.js"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function tempMigrationsDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-migrations-"))
  tempDirs.push(dir)
  return dir
}

describe("listClickHouseMigrationFiles", () => {
  it("returns numbered sql files in version order", () => {
    const dir = tempMigrationsDir()
    fs.writeFileSync(path.join(dir, "0002_second.sql"), "SELECT 2")
    fs.writeFileSync(path.join(dir, "0001_first.sql"), "SELECT 1")
    fs.writeFileSync(path.join(dir, "readme.md"), "ignore")
    fs.writeFileSync(path.join(dir, ".gitkeep"), "")

    const files = listClickHouseMigrationFiles(dir)

    expect(files.map((file) => file.filename)).toEqual([
      "0001_first.sql",
      "0002_second.sql",
    ])
    expect(files[0]?.version).toBe("0001")
    expect(files[0]?.checksum).toBe(checksumSql("SELECT 1"))
  })

  it("rejects duplicate versions", () => {
    const dir = tempMigrationsDir()
    fs.writeFileSync(path.join(dir, "0001_a.sql"), "SELECT 1")
    fs.writeFileSync(path.join(dir, "0001_b.sql"), "SELECT 2")

    expect(() => listClickHouseMigrationFiles(dir)).toThrow(
      /Duplicate ClickHouse migration version 0001/
    )
  })

  it("returns an empty list when the directory is missing", () => {
    expect(
      listClickHouseMigrationFiles(
        path.join(os.tmpdir(), "ch-migrations-missing-" + Date.now())
      )
    ).toEqual([])
  })
})

describe("splitSqlStatements", () => {
  it("splits on semicolon line endings and drops comment-only chunks", () => {
    const sql = `
-- bootstrap
CREATE DATABASE IF NOT EXISTS emailhub;

-- next
CREATE TABLE emailhub.example (id UInt8) ENGINE = Memory;
`

    expect(splitSqlStatements(sql)).toEqual([
      "CREATE DATABASE IF NOT EXISTS emailhub",
      "CREATE TABLE emailhub.example (id UInt8) ENGINE = Memory",
    ])
  })
})

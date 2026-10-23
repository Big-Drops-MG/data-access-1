import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  assertDistinctWorkerDatabases,
  recordWorkerDatabase,
} from "./worker-manifest.js"

describe("worker database manifest", () => {
  const files: string[] = []

  afterEach(() => {
    for (const file of files.splice(0)) {
      fs.rmSync(file, { recursive: true, force: true })
    }
  })

  it("accepts a different database for each worker", () => {
    const manifest = tempManifest()
    recordWorkerDatabase(manifest, "eh_w_one")
    recordWorkerDatabase(manifest, "eh_w_two")

    expect(() => assertDistinctWorkerDatabases(manifest)).not.toThrow()
  })

  it("rejects workers that share a database", () => {
    const manifest = tempManifest()
    recordWorkerDatabase(manifest, "eh_w_same")
    recordWorkerDatabase(manifest, "eh_w_same")

    expect(() => assertDistinctWorkerDatabases(manifest)).toThrow(/shared/)
  })

  function tempManifest(): string {
    const manifest = path.join(
      os.tmpdir(),
      `emailhub-manifest-${files.length}-${Date.now()}`
    )
    files.push(manifest)
    return manifest
  }
})

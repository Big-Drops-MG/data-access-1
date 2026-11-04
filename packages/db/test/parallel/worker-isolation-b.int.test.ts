import { describe, expect, inject, it } from "vitest"

import { expectPrivateWorkerDatabase } from "./worker-isolation-case.js"

const templateName = inject("emailhubTemplateDatabase")
const manifestPath = inject("emailhubWorkerManifest")

describe.skipIf(templateName.length === 0)("worker B database", () => {
  it("keeps rows out of the other worker database", async () => {
    const database = await expectPrivateWorkerDatabase(manifestPath)
    expect(database.startsWith("eh_w_")).toBe(true)
  }, 60_000)
})

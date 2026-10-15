import { describe, expect, it } from "vitest"

import { getSession } from "./auth.js"

describe("getSession", () => {
  it("returns null until auth is wired", async () => {
    await expect(getSession()).resolves.toBeNull()
  })
})

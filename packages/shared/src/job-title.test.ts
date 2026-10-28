import { describe, expect, it } from "vitest"

import { JOB_TITLES, isJobTitle, jobTitleSchema } from "./job-title.js"

describe("jobTitleSchema", () => {
  it("accepts every listed title", () => {
    for (const title of JOB_TITLES) {
      expect(jobTitleSchema.parse(title)).toBe(title)
      expect(isJobTitle(title)).toBe(true)
    }
  })

  it("rejects unknown titles", () => {
    expect(jobTitleSchema.safeParse("Intern").success).toBe(false)
    expect(isJobTitle("admin")).toBe(false)
    expect(isJobTitle(null)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"

import {
  decideFeedbackBodySchema,
  feedbackIdParamSchema,
  feedbackListQuerySchema,
} from "./schemas"

const id = "019a0000-0000-7000-8000-000000000001"
const classificationId = "019a0000-0000-7000-8000-0000000000c1"

describe("feedback schemas", () => {
  it("parses list query with defaults and status filter", () => {
    expect(feedbackListQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(
      feedbackListQuerySchema.parse({ status: "pending", limit: "10" })
    ).toEqual({ status: "pending", limit: 10 })
  })

  it("rejects unknown list query fields and invalid status", () => {
    expect(() => feedbackListQuerySchema.parse({ extra: "x" })).toThrow()
    expect(() => feedbackListQuerySchema.parse({ status: "decided" })).toThrow()
  })

  it("accepts uuid v7 ids and decide bodies", () => {
    expect(feedbackIdParamSchema.parse(id)).toBe(id)
    expect(
      decideFeedbackBodySchema.parse({
        classification_id: classificationId,
        decision: "suppress",
      })
    ).toEqual({
      classification_id: classificationId,
      decision: "suppress",
    })
  })

  it("rejects invalid decide decisions", () => {
    expect(() =>
      decideFeedbackBodySchema.parse({
        classification_id: classificationId,
        decision: "dismiss",
      })
    ).toThrow()
  })
})

import { describe, expect, it } from "vitest"

import { actionLabel, actorTypeLabel, objectTypeLabel } from "./labels"

describe("audit log labels", () => {
  it("labels actor types", () => {
    expect(actorTypeLabel("user")).toBe("User")
    expect(actorTypeLabel("api_client")).toBe("API client")
    expect(actorTypeLabel("system")).toBe("System")
  })

  it("humanizes actions and object types", () => {
    expect(actionLabel("domain.create")).toBe("Domain · Create")
    expect(actionLabel("feedback_item.claim")).toBe("Feedback Item · Claim")
    expect(objectTypeLabel("feedback_item")).toBe("Feedback Item")
  })
})

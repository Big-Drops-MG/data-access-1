import { describe, expect, it } from "vitest"

import { parseSenderRouteConflicts } from "./api"

describe("parseSenderRouteConflicts", () => {
  it("joins route id rows with email_type and name details", () => {
    const routeId = "019a0000-0000-7000-8000-0000000000cc"
    expect(
      parseSenderRouteConflicts([
        { path: "email_route", message: routeId },
        {
          path: `email_route/${routeId}/email_type`,
          message: "thank_you",
        },
        {
          path: `email_route/${routeId}/name`,
          message: "Default",
        },
      ])
    ).toEqual([
      {
        id: routeId,
        emailType: "thank_you",
        name: "Default",
      },
    ])
  })
})

import { describe, expect, it } from "vitest"

import {
  LIST_UNSUBSCRIBE_ONE_CLICK_BODY,
  parseUnsubscribeRequestBody,
} from "./apply-unsubscribe.js"

describe("parseUnsubscribeRequestBody", () => {
  it("treats empty and one-click bodies as category opt-out", () => {
    expect(parseUnsubscribeRequestBody("")).toEqual({
      scope: "category",
      oneClick: false,
    })
    expect(
      parseUnsubscribeRequestBody(LIST_UNSUBSCRIBE_ONE_CLICK_BODY)
    ).toEqual({
      scope: "category",
      oneClick: true,
    })
  })

  it("accepts scope all and category lists", () => {
    expect(
      parseUnsubscribeRequestBody(JSON.stringify({ scope: "all" }))
    ).toEqual({
      scope: "all",
      oneClick: false,
    })
    expect(
      parseUnsubscribeRequestBody(
        JSON.stringify({ categories: ["engagement", "news"] })
      )
    ).toEqual({
      scope: "category",
      categoryKeys: ["engagement", "news"],
      oneClick: false,
    })
  })

  it("rejects unknown fields and invalid JSON", () => {
    expect(() => parseUnsubscribeRequestBody("{")).toThrow("invalid_json")
    expect(() =>
      parseUnsubscribeRequestBody(JSON.stringify({ foo: 1 }))
    ).toThrow("unknown_field")
  })
})

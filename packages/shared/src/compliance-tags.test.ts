import { describe, expect, it } from "vitest"

import {
  PENDING_UNSUBSCRIBE_MERGE_VALUE,
  POSTAL_ADDRESS_MERGE_TAG,
  UNSUBSCRIBE_MERGE_TAG,
  applyRenderedComplianceMergeData,
  fillMissingComplianceMergeData,
  messageEnvironment,
} from "./compliance-tags.js"

describe("messageEnvironment", () => {
  it("keeps test and treats every other value as production", () => {
    expect(messageEnvironment("test")).toBe("test")
    expect(messageEnvironment("production")).toBe("production")
    expect(messageEnvironment(undefined)).toBe("production")
    expect(messageEnvironment(null)).toBe("production")
    expect(messageEnvironment("staging")).toBe("production")
  })
})

describe("fillMissingComplianceMergeData", () => {
  it("fills only required blank compliance tags", () => {
    expect(
      fillMissingComplianceMergeData(
        { first_name: "Ada", [POSTAL_ADDRESS_MERGE_TAG]: "  " },
        [UNSUBSCRIBE_MERGE_TAG, POSTAL_ADDRESS_MERGE_TAG],
        " 1 Market Street "
      )
    ).toEqual({
      first_name: "Ada",
      [UNSUBSCRIBE_MERGE_TAG]: PENDING_UNSUBSCRIBE_MERGE_VALUE,
      [POSTAL_ADDRESS_MERGE_TAG]: "1 Market Street",
    })
  })

  it("keeps caller values and skips tags the template does not require", () => {
    expect(
      fillMissingComplianceMergeData(
        { [UNSUBSCRIBE_MERGE_TAG]: "https://example.com/keep" },
        [UNSUBSCRIBE_MERGE_TAG],
        null
      )
    ).toEqual({
      [UNSUBSCRIBE_MERGE_TAG]: "https://example.com/keep",
    })
    expect(
      fillMissingComplianceMergeData(undefined, ["first_name"], undefined)
    ).toEqual({})
  })

  it("leaves a required postal tag blank when the sender has no address", () => {
    expect(
      fillMissingComplianceMergeData(null, [POSTAL_ADDRESS_MERGE_TAG], "   ")
    ).toEqual({})
  })
})

describe("applyRenderedComplianceMergeData", () => {
  it("overwrites compliance tags with the signed values", () => {
    expect(
      applyRenderedComplianceMergeData(
        { first_name: "Ada", [UNSUBSCRIBE_MERGE_TAG]: "old" },
        {
          unsubscribeUrl: "https://example.com/unsubscribe/ada",
          postalAddress: "1 Market Street",
        }
      )
    ).toEqual({
      first_name: "Ada",
      [UNSUBSCRIBE_MERGE_TAG]: "https://example.com/unsubscribe/ada",
      [POSTAL_ADDRESS_MERGE_TAG]: "1 Market Street",
    })
    expect(
      applyRenderedComplianceMergeData(undefined, {
        unsubscribeUrl: "https://example.com/unsubscribe/ada",
        postalAddress: "1 Market Street",
      })[POSTAL_ADDRESS_MERGE_TAG]
    ).toBe("1 Market Street")
  })
})

import { describe, expect, it } from "vitest"

import { buildMergeTagsRecord, extractMergeTagNames } from "./merge-tags.js"

describe("extractMergeTagNames", () => {
  it("extracts unique tags in first-seen order across subject and body", () => {
    expect(
      extractMergeTagNames(
        "Hi {{first_name}} — {{quote_url}}",
        '<p>{{first_name}}</p><a href="{{quote_url}}">x</a>{{company}}'
      )
    ).toEqual(["first_name", "quote_url", "company"])
  })

  it("allows whitespace inside braces", () => {
    expect(extractMergeTagNames("{{  first_name  }}")).toEqual(["first_name"])
  })

  it("ignores invalid or incomplete tokens", () => {
    expect(
      extractMergeTagNames("{{1bad}} {{ok_tag}} {single} {{}} {{space name}}")
    ).toEqual(["ok_tag"])
  })

  it("returns empty when there are no tags", () => {
    expect(extractMergeTagNames("plain", "<p>no tags</p>")).toEqual([])
  })
})

describe("buildMergeTagsRecord", () => {
  it("maps each tag to string type", () => {
    expect(buildMergeTagsRecord("Hello {{name}}")).toEqual({ name: "string" })
  })
})

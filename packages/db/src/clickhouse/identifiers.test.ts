import { describe, expect, it } from "vitest"

import { assertClickHouseTableName } from "./identifiers.js"

describe("assertClickHouseTableName", () => {
  it("accepts plain identifiers", () => {
    expect(assertClickHouseTableName("email_events")).toBe("email_events")
    expect(assertClickHouseTableName("_tmp")).toBe("_tmp")
  })

  it("rejects injection-shaped names", () => {
    expect(() => assertClickHouseTableName("email_events; DROP")).toThrow(
      /Invalid ClickHouse table name/
    )
    expect(() => assertClickHouseTableName("a.b")).toThrow(
      /Invalid ClickHouse table name/
    )
    expect(() => assertClickHouseTableName("")).toThrow(
      /Invalid ClickHouse table name/
    )
  })
})

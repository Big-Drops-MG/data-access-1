import { afterEach, describe, expect, it } from "vitest"

import { assertClickHouseUrl } from "./env.js"

describe("assertClickHouseUrl", () => {
  const original = process.env.CLICKHOUSE_URL

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CLICKHOUSE_URL
    } else {
      process.env.CLICKHOUSE_URL = original
    }
  })

  it("accepts http and https urls", () => {
    expect(() => assertClickHouseUrl("http://localhost:8123")).not.toThrow()
    expect(() =>
      assertClickHouseUrl("https://clickhouse.example.com:8443")
    ).not.toThrow()
  })

  it("rejects non-http protocols", () => {
    expect(() => assertClickHouseUrl("clickhouse://localhost:9000")).toThrow(
      /http or https/
    )
  })
})

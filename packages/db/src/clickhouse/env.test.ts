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

  it("accepts http on loopback / Docker DNS / private IPs", () => {
    expect(() => assertClickHouseUrl("http://localhost:8123")).not.toThrow()
    expect(() => assertClickHouseUrl("http://clickhouse:8123")).not.toThrow()
    expect(() => assertClickHouseUrl("http://10.0.0.5:8123")).not.toThrow()
  })

  it("requires https for public hosts", () => {
    expect(() =>
      assertClickHouseUrl("https://clickhouse.example.com:8443")
    ).not.toThrow()
    expect(() =>
      assertClickHouseUrl("http://clickhouse.example.com:8123")
    ).toThrow(/must use https/)
  })

  it("rejects non-http protocols", () => {
    expect(() => assertClickHouseUrl("clickhouse://localhost:9000")).toThrow(
      /http or https/
    )
  })
})

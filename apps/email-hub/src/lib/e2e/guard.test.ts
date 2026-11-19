import { afterEach, describe, expect, it } from "vitest"

import { authorizeE2eRequest, e2eHarnessEnabled } from "./guard"

const SECRET = "e2e-test-secret-value-with-32-chars"

function request(url: string, authorization?: string): Request {
  return new Request(url, {
    method: "POST",
    headers: authorization ? { authorization } : {},
  })
}

describe("e2e harness guard", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    EMAILHUB_ENV: process.env.EMAILHUB_ENV,
    E2E: process.env.E2E,
    E2E_AUTH_SECRET: process.env.E2E_AUTH_SECRET,
  }

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete env[key]
      } else {
        env[key] = value
      }
    }
  })

  it("stays disabled in production even when the flag and secret are set", () => {
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = "production"
    env.EMAILHUB_ENV = "dev"
    env.E2E = "1"
    env.E2E_AUTH_SECRET = SECRET
    expect(e2eHarnessEnabled()).toBe(false)
    expect(
      authorizeE2eRequest(
        request("http://127.0.0.1:3099/api/e2e/sign-in", `Bearer ${SECRET}`)
      )
    ).toBe(false)
  })

  it("accepts only a loopback request with the matching bearer secret", () => {
    const env = process.env as Record<string, string | undefined>
    env.NODE_ENV = "development"
    env.EMAILHUB_ENV = "dev"
    env.E2E = "1"
    env.E2E_AUTH_SECRET = SECRET
    expect(e2eHarnessEnabled()).toBe(true)
    expect(
      authorizeE2eRequest(
        request("http://127.0.0.1:3099/api/e2e/sign-in", `Bearer ${SECRET}`)
      )
    ).toBe(true)
    expect(
      authorizeE2eRequest(
        request("http://127.0.0.1:3099/api/e2e/sign-in", "Bearer wrong-secret")
      )
    ).toBe(false)
    expect(
      authorizeE2eRequest(
        request("https://emailhub.example/api/e2e/sign-in", `Bearer ${SECRET}`)
      )
    ).toBe(false)
  })
})

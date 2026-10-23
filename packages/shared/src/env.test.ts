import { afterEach, describe, expect, it } from "vitest"

import {
  EnvValidationError,
  parseServerEnv,
  resetServerEnvCache,
} from "./env.js"

const baseWorkerEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://emailhub_app:x@127.0.0.1:5432/emailhub",
  REDIS_URL: "redis://127.0.0.1:6379",
  CLICKHOUSE_URL: "http://127.0.0.1:8123",
  MAIL_TRANSPORT: "smtp",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
} as const

const baseWebEnv = {
  ...baseWorkerEnv,
  BETTER_AUTH_SECRET: "dev-better-auth-secret-change-me",
  BETTER_AUTH_URL: "http://localhost:3000",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
} as const

afterEach(() => {
  resetServerEnvCache()
})

describe("parseServerEnv", () => {
  it("accepts a valid worker env", () => {
    const env = parseServerEnv({ ...baseWorkerEnv }, "worker")
    expect(env.DATABASE_URL).toContain("postgresql://")
    expect(env.MAIL_TRANSPORT).toBe("smtp")
  })

  it("accepts a valid web env", () => {
    const env = parseServerEnv({ ...baseWebEnv }, "web")
    expect(env).toMatchObject({
      BETTER_AUTH_URL: "http://localhost:3000",
      GOOGLE_CLIENT_ID: "google-client-id",
    })
  })

  it("fails with a clear message when a required variable is missing", () => {
    expect(() =>
      parseServerEnv({ ...baseWorkerEnv, DATABASE_URL: "" }, "worker")
    ).toThrow(EnvValidationError)

    expect(() =>
      parseServerEnv({ ...baseWorkerEnv, DATABASE_URL: undefined }, "worker")
    ).toThrow(/Invalid environment[\s\S]*DATABASE_URL/)
  })

  it("requires SMTP settings when MAIL_TRANSPORT=smtp", () => {
    expect(() =>
      parseServerEnv(
        { ...baseWorkerEnv, SMTP_HOST: undefined, SMTP_PORT: undefined },
        "worker"
      )
    ).toThrow(/SMTP_HOST/)
  })

  it("requires SES_REGION when MAIL_TRANSPORT=ses", () => {
    expect(() =>
      parseServerEnv(
        {
          ...baseWorkerEnv,
          MAIL_TRANSPORT: "ses",
          SMTP_HOST: undefined,
          SMTP_PORT: undefined,
        },
        "worker"
      )
    ).toThrow(/SES_REGION/)
  })

  it("refuses prod deploy unless MAIL_TRANSPORT=ses", () => {
    expect(() =>
      parseServerEnv(
        {
          ...baseWorkerEnv,
          NODE_ENV: "production",
          EMAILHUB_ENV: "prod",
          MAIL_TRANSPORT: "smtp",
        },
        "worker"
      )
    ).toThrow(/MAIL_TRANSPORT[\s\S]*ses in production/)
  })

  it("refuses prod deploy when E2E is set", () => {
    expect(() =>
      parseServerEnv(
        {
          ...baseWorkerEnv,
          NODE_ENV: "production",
          EMAILHUB_ENV: "prod",
          MAIL_TRANSPORT: "ses",
          SES_REGION: "us-east-1",
          SMTP_HOST: undefined,
          SMTP_PORT: undefined,
          E2E: "1",
        },
        "worker"
      )
    ).toThrow(/E2E[\s\S]*must not be set in production/)
  })

  it("accepts prod deploy with MAIL_TRANSPORT=ses and no E2E", () => {
    const env = parseServerEnv(
      {
        ...baseWorkerEnv,
        NODE_ENV: "production",
        EMAILHUB_ENV: "prod",
        MAIL_TRANSPORT: "ses",
        SES_REGION: "us-east-1",
        SMTP_HOST: undefined,
        SMTP_PORT: undefined,
      },
      "worker"
    )
    expect(env.MAIL_TRANSPORT).toBe("ses")
    expect(env.E2E).toBeUndefined()
  })

  it("allows Dev droplet smtp when EMAILHUB_ENV=dev", () => {
    const env = parseServerEnv(
      {
        ...baseWorkerEnv,
        NODE_ENV: "production",
        EMAILHUB_ENV: "dev",
        MAIL_TRANSPORT: "smtp",
      },
      "worker"
    )
    expect(env.MAIL_TRANSPORT).toBe("smtp")
  })

  it("requires auth vars for web role", () => {
    expect(() => parseServerEnv({ ...baseWorkerEnv }, "web")).toThrow(
      /BETTER_AUTH_SECRET/
    )
  })
})

import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { apiClient } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createUser } from "@workspace/db/test"
import { afterAll, describe, expect, it } from "vitest"

import { POST } from "@/app/api/ext/emails/send/route"
import {
  buildMachineSigningPayload,
  signMachinePayload,
} from "@/lib/auth/machine-hmac"
import { encryptWithAppKey } from "@/lib/crypto/app-encryption"

const databaseUrl = process.env.DATABASE_URL?.trim()
const previousEncryptionKey = process.env.APP_ENCRYPTION_KEY
const encryptionKey = `v1:${Buffer.alloc(32, 7).toString("base64")}`
process.env.APP_ENCRYPTION_KEY = encryptionKey

describe.skipIf(!databaseUrl)("T-093 send API auth", () => {
  afterAll(() => {
    if (previousEncryptionKey === undefined) {
      delete process.env.APP_ENCRYPTION_KEY
    } else {
      process.env.APP_ENCRYPTION_KEY = previousEncryptionKey
    }
  })

  it("rejects a forged machine signature", async () => {
    const client = await insertClient(["emails:send"])
    const response = await POST(
      signedRequest(client, validBody(), "not-the-secret")
    )
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    })
  })

  it("rejects an unknown API client", async () => {
    const response = await POST(
      signedRequest(
        {
          id: "01930000-0000-7000-8000-000000000099",
          secret: "missing-secret",
        },
        validBody(),
        "missing-secret"
      )
    )
    expect(response.status).toBe(401)
  })

  it("rejects a key that cannot send", async () => {
    const client = await insertClient(["emails:read"])
    const response = await POST(
      signedRequest(client, validBody(), client.secret)
    )
    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "forbidden" },
    })
  })

  it("rejects a revoked key", async () => {
    const client = await insertClient(["emails:send"], "revoked")
    const response = await POST(
      signedRequest(client, validBody(), client.secret)
    )
    expect(response.status).toBe(401)
  })

  it("rejects an invalid send body after a valid signature when redis is up", async ({
    skip,
  }) => {
    if (!loopbackRedisUrl()) skip()
    const client = await insertClient(["emails:send"])
    const response = await POST(
      signedRequest(
        client,
        JSON.stringify({
          email_type: "thank_you",
          idempotency_key: `t093-${randomBytes(3).toString("hex")}`,
        }),
        client.secret
      )
    )
    expect(response.status).toBe(422)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_failed" },
    })
  })
})

async function insertClient(
  scopes: string[],
  status: "active" | "revoked" = "active"
): Promise<{ id: string; secret: string }> {
  const secret = `t093-secret-${randomBytes(8).toString("hex")}`
  const staff = await createUser(getDb())
  const key = encryptionKey
  if (!key) throw new Error("APP_ENCRYPTION_KEY is not configured")
  const [row] = await getDb()
    .insert(apiClient)
    .values({
      name: `T-093 ${randomBytes(3).toString("hex")}`,
      keyPrefix: `t093${randomBytes(3).toString("hex")}`,
      secretHash: createHash("sha256").update(secret, "utf8").digest("hex"),
      secretEncrypted: encryptWithAppKey(secret, key),
      scopes,
      ipAllowlist: [],
      status,
      createdBy: staff.id,
    })
    .returning({ id: apiClient.id })
  if (!row) throw new Error("api client insert failed")
  return { id: row.id, secret }
}

function signedRequest(
  client: { id: string; secret: string },
  body: string,
  secret: string
): Request {
  const requestPath = "/api/ext/emails/send"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = signMachinePayload(
    secret,
    buildMachineSigningPayload({
      timestamp,
      method: "POST",
      pathWithQuery: requestPath,
      body: Buffer.from(body),
    })
  )
  return new Request(`http://127.0.0.1${requestPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-key-id": client.id,
      "x-timestamp": timestamp,
      "x-signature": signature,
    },
    body,
  })
}

function validBody(): string {
  return JSON.stringify({
    to: "person@example.com",
    email_type: "thank_you",
    idempotency_key: `t093-${randomBytes(3).toString("hex")}`,
  })
}

function loopbackRedisUrl(): string | null {
  const candidates = [
    process.env.REDIS_URL,
    readEnvValue(path.resolve("apps/email-hub/.env"), "REDIS_URL"),
    readEnvValue(path.resolve(".env"), "REDIS_URL"),
  ]
  for (const value of candidates) {
    if (!value) continue
    try {
      const url = new URL(value)
      const loopback =
        url.hostname === "127.0.0.1" || url.hostname === "localhost"
      if (
        loopback &&
        (url.protocol === "redis:" || url.protocol === "rediss:")
      ) {
        if (!process.env.REDIS_URL) process.env.REDIS_URL = value
        return value
      }
    } catch {
      continue
    }
  }
  return null
}

function readEnvValue(file: string, key: string): string | null {
  if (!fs.existsSync(file)) return null
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  if (!line) return null
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
}

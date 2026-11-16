import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiClient } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import type * as SharedModule from "@workspace/shared"

import {
  MACHINE_OLD_SECRET_TTL_MS,
  authenticateMachineRequest,
  buildMachineSigningPayload,
  signMachinePayload,
  type MachineClientAuthRecord,
} from "@/lib/auth/machine-hmac"
import { decryptWithAppKey } from "@/lib/crypto/app-encryption"

const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

import { hashApiClientSecret } from "./secrets"
import {
  createApiClient,
  disableApiClient,
  getApiClient,
  listApiClients,
  rotateApiClientSecret,
  updateApiClientAllowlist,
  updateApiClientScopes,
} from "./service"

const KEY = Buffer.alloc(32, 9).toString("base64")
const actor = {
  userId: "019a0000-0000-7000-8000-0000000000aa",
  requestId: "req-api-clients",
}
const NOW = new Date("2026-11-13T12:00:00.000Z")

type Row = Record<string, unknown>

function paramsOf(clause: unknown): unknown[] {
  const params: unknown[] = []
  const seen = new WeakSet<object>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return
    }
    if (seen.has(value)) {
      return
    }
    seen.add(value)
    if ("brand" in value && "encoder" in value && "value" in value) {
      params.push((value as { value: unknown }).value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const child of Object.values(value)) {
      walk(child)
    }
  }
  walk(clause)
  return params
}

function matches(row: Row, params: unknown[]): boolean {
  return params.every((param) =>
    Object.values(row).some((value) => value === param)
  )
}

function createMemory(initial: Row[] = []) {
  const box: { committed: Row[] } = {
    committed: initial.map((row) => ({ ...row })),
  }
  let chain = Promise.resolve()

  function acquire(): Promise<() => void> {
    let unlock = () => {}
    const next = new Promise<void>((resolve) => {
      unlock = () => resolve()
    })
    const waitFor = chain
    chain = chain.then(() => next)
    return waitFor.then(() => unlock)
  }

  function query(
    getRows: () => Row[],
    setRows: (rows: Row[]) => void,
    mode: "select" | "update" | "insert"
  ) {
    let clause: unknown
    let limit: number | null = null
    let patch: Row | null = null
    let insertRow: Row | null = null

    const run = () => {
      const current = getRows()
      const params = clause ? paramsOf(clause) : []
      const matched = clause
        ? current.filter((row) => matches(row, params))
        : current
      if (mode === "select") {
        return limit == null ? matched : matched.slice(0, limit)
      }
      if (mode === "update") {
        const next = current.map((row) =>
          matches(row, params) ? { ...row, ...patch } : row
        )
        setRows(next)
        return next.filter((row) => matches(row, params))
      }
      const created = { ...(insertRow ?? {}) }
      setRows([...current, created])
      return [created]
    }

    const chainQuery: Record<string, unknown> = {}
    const self = () => chainQuery
    chainQuery.from = () => self()
    chainQuery.where = (next: unknown) => {
      clause = next
      return self()
    }
    chainQuery.limit = (next: number) => {
      limit = next
      return self()
    }
    chainQuery.orderBy = () => self()
    chainQuery.for = () => self()
    chainQuery.set = (next: Row) => {
      patch = next
      return self()
    }
    chainQuery.values = (next: Row) => {
      insertRow = next
      return self()
    }
    chainQuery.returning = () => Promise.resolve(run())
    chainQuery.then = (
      onFulfilled: (value: Row[]) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(run()).then(onFulfilled, onRejected)
    return chainQuery
  }

  function database(
    getRows: () => Row[],
    setRows: (rows: Row[]) => void
  ): Database {
    return {
      select: () => query(getRows, setRows, "select"),
      update: (table: unknown) => {
        if (table !== apiClient) {
          throw new Error("Unexpected table")
        }
        return query(getRows, setRows, "update")
      },
      insert: (table: unknown) => {
        if (table !== apiClient) {
          throw new Error("Unexpected table")
        }
        return query(getRows, setRows, "insert")
      },
      execute: async () => [],
      transaction: async (run: (tx: Database) => Promise<unknown>) => {
        const draft = { rows: structuredClone(getRows()) }
        let unlock: (() => void) | null = null
        const tx = database(
          () => draft.rows,
          (rows) => {
            draft.rows = rows
          }
        ) as unknown as {
          execute: (statement: unknown) => Promise<unknown>
        }
        const originalExecute = tx.execute.bind(tx)
        tx.execute = async (statement: unknown) => {
          unlock = await acquire()
          draft.rows = structuredClone(box.committed)
          return originalExecute(statement)
        }
        try {
          const result = await run(tx as unknown as Database)
          box.committed = draft.rows
          return result
        } finally {
          const release = unlock as (() => void) | null
          if (release) {
            release()
          }
        }
      },
    } as unknown as Database
  }

  return {
    db: database(
      () => box.committed,
      () => {
        throw new Error("write outside transaction")
      }
    ),
    rows: () => box.committed,
  }
}

function deps(
  memory: ReturnType<typeof createMemory>,
  extra: {
    now?: Date
    keyPrefix?: () => string
    secret?: () => string
  } = {}
) {
  return {
    db: memory.db,
    now: extra.now ?? NOW,
    encryptionKey: KEY,
    keyPrefix: extra.keyPrefix,
    secret: extra.secret,
  }
}

function authRecord(row: Row): MachineClientAuthRecord {
  const old = row.oldSecretEncrypted
  return {
    id: String(row.id),
    status: row.status as "active" | "revoked",
    scopes: (row.scopes as string[]) ?? [],
    ipAllowlist: (row.ipAllowlist as string[]) ?? [],
    secret: decryptWithAppKey(String(row.secretEncrypted), KEY),
    oldSecret: typeof old === "string" ? decryptWithAppKey(old, KEY) : null,
    rotatedAt: (row.rotatedAt as Date | null) ?? null,
    expiresAt: (row.expiresAt as Date | null) ?? null,
  }
}

function signed(input: {
  id: string
  secret: string
  path?: string
  forwardedFor?: string
  now?: Date
  extraHeaders?: Record<string, string>
}) {
  const path = input.path ?? "/api/ext/emails/send"
  const body = Buffer.from("{}", "utf8")
  const timestamp = Math.floor((input.now ?? NOW).getTime() / 1000)
  const payload = buildMachineSigningPayload({
    timestamp: String(timestamp),
    method: "POST",
    pathWithQuery: path,
    body,
  })
  return {
    request: new Request(`https://emailhub.test${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-key-id": input.id,
        "x-timestamp": String(timestamp),
        "x-signature": signMachinePayload(input.secret, payload),
        "x-forwarded-for": input.forwardedFor ?? "203.0.113.10",
        ...input.extraHeaders,
      },
      body,
    }),
    body,
  }
}

async function authed(
  row: Row,
  secret: string,
  options: {
    scope?: string
    forwardedFor?: string
    now?: Date
    path?: string
    extraHeaders?: Record<string, string>
  } = {}
) {
  const { request, body } = signed({
    id: String(row.id),
    secret,
    path: options.path,
    forwardedFor: options.forwardedFor,
    now: options.now,
    extraHeaders: options.extraHeaders,
  })
  return authenticateMachineRequest(request, body, {
    requiredScope: options.scope ?? "emails:send",
    resolveClient: async () => authRecord(row),
    consumeRateLimit: async () => "ok",
    now: () => options.now ?? NOW,
  })
}

describe("API client administration", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({ id: "audit" })
  })

  it("creates a client, returns the secret once, and stores only a hash and ciphertext", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      {
        name: " Billing ",
        scopes: ["emails:read", "emails:send", "emails:send"],
        ipAllowlist: ["2001:0db8::1"],
      },
      actor,
      deps(memory)
    )

    expect(created.secret).toEqual(expect.any(String))
    expect(created.scopes).toEqual(["emails:send", "emails:read"])
    expect(created.ip_allowlist).toEqual(["2001:db8::1"])
    expect(created.status).toBe("active")
    expect(created).not.toHaveProperty("secret_hash")

    const row = memory.rows()[0]
    expect(row?.secretHash).toBe(hashApiClientSecret(created.secret))
    expect(row?.secretEncrypted).not.toBe(created.secret)
    expect(row?.secretHash).not.toBe(created.secret)
    expect(JSON.stringify(row)).not.toContain(created.secret)
    expect(decryptWithAppKey(String(row?.secretEncrypted), KEY)).toBe(
      created.secret
    )

    const listed = await listApiClients(deps(memory))
    const detail = await getApiClient(created.id, deps(memory))
    expect(JSON.stringify(listed)).not.toContain(created.secret)
    expect(JSON.stringify(detail)).not.toContain(created.secret)
    expect(detail).not.toHaveProperty("secret")
    expect(listed.api_clients[0]).not.toHaveProperty("secret")

    const audit = JSON.stringify(writeAudit.mock.calls)
    expect(audit).not.toContain(created.secret)
    expect(audit).not.toContain(String(row?.secretHash))
    expect(audit).not.toContain(String(row?.secretEncrypted))
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "api_client.created",
        objectType: "api_client",
        objectId: created.id,
      })
    )

    await expect(
      authed(row ?? {}, created.secret, { forwardedFor: "2001:db8::1" })
    ).resolves.toMatchObject({
      id: created.id,
    })
  })

  it("rejects unknown scopes and invalid CIDR before writing", async () => {
    const memory = createMemory()
    await expect(
      createApiClient(
        { name: "Billing", scopes: ["emails:admin"] },
        actor,
        deps(memory)
      )
    ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
    await expect(
      createApiClient(
        {
          name: "Billing",
          scopes: ["emails:send"],
          ipAllowlist: ["10.0.0.0/8"],
        },
        actor,
        deps(memory)
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({ message: "CIDR ranges are not supported" }),
      ],
    })
    expect(memory.rows()).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("retries a conflicting key prefix and then stops", async () => {
    const memory = createMemory()
    await createApiClient(
      { name: "One", scopes: ["emails:send"] },
      actor,
      deps(memory, { keyPrefix: () => "eh_aaaaaaaa" })
    )
    let attempt = 0
    const second = await createApiClient(
      { name: "Two", scopes: ["emails:send"] },
      actor,
      deps(memory, {
        keyPrefix: () => (attempt++ === 0 ? "eh_aaaaaaaa" : "eh_bbbbbbbb"),
      })
    )
    expect(second.key_prefix).toBe("eh_bbbbbbbb")

    await expect(
      createApiClient(
        { name: "Three", scopes: ["emails:send"] },
        actor,
        deps(memory, { keyPrefix: () => "eh_aaaaaaaa" })
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(memory.rows()).toHaveLength(2)
  })

  it("rolls back the client when the audit write fails", async () => {
    const memory = createMemory()
    writeAudit.mockRejectedValueOnce(new Error("audit insert failed"))
    await expect(
      createApiClient(
        { name: "Billing", scopes: ["emails:send"] },
        actor,
        deps(memory)
      )
    ).rejects.toThrow("audit insert failed")
    expect(memory.rows()).toHaveLength(0)
  })

  it("accepts the previous secret for 24 hours and only the latest previous secret", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      { name: "Billing", scopes: ["emails:send"] },
      actor,
      deps(memory, { secret: () => "original-secret-value" })
    )
    const first = await rotateApiClientSecret(
      created.id,
      actor,
      deps(memory, { secret: () => "rotated-secret-one" })
    )
    expect(first.secret).toBe("rotated-secret-one")
    expect(first.previous_secret_expires_at).toBe("2026-11-14T12:00:00.000Z")
    expect(JSON.stringify(first)).not.toContain("original-secret-value")

    let row = memory.rows()[0] ?? {}
    await expect(authed(row, "original-secret-value")).resolves.toMatchObject({
      id: created.id,
    })
    await expect(authed(row, first.secret)).resolves.toMatchObject({
      id: created.id,
    })

    const later = new Date(NOW.getTime() + MACHINE_OLD_SECRET_TTL_MS + 1)
    await expect(
      authed(row, "original-secret-value", { now: later })
    ).rejects.toMatchObject({
      status: 401,
    })
    await expect(
      authed(row, first.secret, { now: later })
    ).resolves.toMatchObject({
      id: created.id,
    })

    const second = await rotateApiClientSecret(
      created.id,
      actor,
      deps(memory, {
        now: new Date("2026-11-13T13:00:00.000Z"),
        secret: () => "rotated-secret-two",
      })
    )
    row = memory.rows()[0] ?? {}
    expect(hashApiClientSecret("original-secret-value")).not.toBe(
      row.secretHash
    )
    expect(hashApiClientSecret("original-secret-value")).not.toBe(
      row.oldSecretHash
    )
    expect(row.secretHash).toBe(hashApiClientSecret(second.secret))
    expect(row.oldSecretHash).toBe(hashApiClientSecret(first.secret))
    const duringOverlap = new Date("2026-11-13T13:00:00.000Z")
    await expect(
      authed(row, "original-secret-value", { now: duringOverlap })
    ).rejects.toMatchObject({ status: 401 })
    await expect(
      authed(row, first.secret, { now: duringOverlap })
    ).resolves.toMatchObject({ id: created.id })
    await expect(
      authed(row, second.secret, { now: duringOverlap })
    ).resolves.toMatchObject({ id: created.id })

    const rotateAudit = writeAudit.mock.calls.map((call) => call[1])
    expect(JSON.stringify(rotateAudit)).not.toContain("rotated-secret-one")
    expect(JSON.stringify(rotateAudit)).not.toContain("rotated-secret-two")
    expect(JSON.stringify(rotateAudit)).not.toContain(String(row.secretHash))
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "api_client.rotated" })
    )
  })

  it("serializes concurrent rotations so only one previous secret remains", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      { name: "Billing", scopes: ["emails:send"] },
      actor,
      deps(memory, { secret: () => "original-secret-value" })
    )
    let sequence = 0
    const [left, right] = await Promise.all([
      rotateApiClientSecret(
        created.id,
        actor,
        deps(memory, {
          secret: () => `concurrent-secret-${sequence++}`,
        })
      ),
      rotateApiClientSecret(
        created.id,
        actor,
        deps(memory, {
          secret: () => `concurrent-secret-${sequence++}`,
        })
      ),
    ])
    const row = memory.rows()[0] ?? {}
    const hashes = [left.secret, right.secret].map((secret) =>
      hashApiClientSecret(secret)
    )
    expect(hashes).toContain(row.secretHash)
    expect(hashes).toContain(row.oldSecretHash)
    expect(row.secretHash).not.toBe(row.oldSecretHash)
    expect(hashApiClientSecret("original-secret-value")).not.toBe(
      row.secretHash
    )
    expect(hashApiClientSecret("original-secret-value")).not.toBe(
      row.oldSecretHash
    )
    await expect(authed(row, left.secret)).resolves.toMatchObject({
      id: created.id,
    })
    await expect(authed(row, right.secret)).resolves.toMatchObject({
      id: created.id,
    })
    await expect(authed(row, "original-secret-value")).rejects.toMatchObject({
      status: 401,
    })
  })

  it("rejects both secrets after disable and treats a second disable as a no-op", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      { name: "Billing", scopes: ["emails:send"] },
      actor,
      deps(memory, { secret: () => "original-secret-value" })
    )
    const rotated = await rotateApiClientSecret(
      created.id,
      actor,
      deps(memory, { secret: () => "rotated-secret-one" })
    )
    const disabled = await disableApiClient(created.id, actor, deps(memory))
    expect(disabled.status).toBe("revoked")
    expect(disabled.already_disabled).toBe(false)
    expect(disabled).not.toHaveProperty("secret")
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "api_client.disabled" })
    )

    const row = memory.rows()[0] ?? {}
    await expect(authed(row, rotated.secret)).rejects.toMatchObject({
      status: 401,
    })
    await expect(authed(row, "original-secret-value")).rejects.toMatchObject({
      status: 401,
    })

    writeAudit.mockClear()
    const again = await disableApiClient(created.id, actor, deps(memory))
    expect(again.already_disabled).toBe(true)
    expect(writeAudit).not.toHaveBeenCalled()
    await expect(
      rotateApiClientSecret(created.id, actor, deps(memory))
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("applies scope changes on the next request and audits the old and new lists", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      { name: "Billing", scopes: ["emails:send", "emails:read"] },
      actor,
      deps(memory, { secret: () => "original-secret-value" })
    )
    await expect(
      updateApiClientScopes(created.id, ["emails:admin"], actor, deps(memory))
    ).rejects.toMatchObject({ code: "validation_failed" })

    const updated = await updateApiClientScopes(
      created.id,
      ["emails:read"],
      actor,
      deps(memory)
    )
    expect(updated.scopes).toEqual(["emails:read"])
    expect(updated).not.toHaveProperty("secret")
    const row = memory.rows()[0] ?? {}
    await expect(
      authed(row, "original-secret-value", { scope: "emails:send" })
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      authed(row, "original-secret-value", {
        scope: "emails:read",
        path: "/api/ext/emails/message",
      })
    ).resolves.toMatchObject({ id: created.id })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "api_client.scopes_updated",
        before: { scopes: ["emails:send", "emails:read"] },
        after: { scopes: ["emails:read"] },
      })
    )
  })

  it("enforces the allowlist from the trusted proxy hop and audits the change", async () => {
    const memory = createMemory()
    const created = await createApiClient(
      { name: "Billing", scopes: ["emails:send"], ipAllowlist: [] },
      actor,
      deps(memory, { secret: () => "original-secret-value" })
    )
    await expect(
      updateApiClientAllowlist(created.id, ["10.0.0.0/33"], actor, deps(memory))
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({ message: "CIDR ranges are not supported" }),
      ],
    })

    const updated = await updateApiClientAllowlist(
      created.id,
      ["203.0.113.10", "2001:0db8::1"],
      actor,
      deps(memory)
    )
    expect(updated.ip_allowlist).toEqual(["203.0.113.10", "2001:db8::1"])
    const row = memory.rows()[0] ?? {}
    await expect(
      authed(row, "original-secret-value", {
        forwardedFor: "198.51.100.1, 203.0.113.10",
      })
    ).resolves.toMatchObject({ id: created.id })
    await expect(
      authed(row, "original-secret-value", {
        forwardedFor: "2001:0db8:0000:0000:0000:0000:0000:0001",
      })
    ).resolves.toMatchObject({ id: created.id })
    await expect(
      authed(row, "original-secret-value", {
        forwardedFor: "203.0.113.10, 198.51.100.8",
        extraHeaders: { "x-real-ip": "203.0.113.10" },
      })
    ).rejects.toMatchObject({ status: 403 })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "api_client.ip_allowlist_updated",
        before: { ip_allowlist: [] },
        after: { ip_allowlist: ["203.0.113.10", "2001:db8::1"] },
      })
    )
  })
})

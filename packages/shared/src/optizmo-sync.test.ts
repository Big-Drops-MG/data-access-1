import { Readable } from "node:stream"

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

import { offer, suppressionEntry, suppressionSyncRun } from "@workspace/db"

import { encryptWithAppKey } from "./app-encryption.js"
import { OPTIZMO_DEFAULT_BASE_URL } from "./optizmo-client.js"
import {
  OPTIZMO_FIRST_DOWNLOAD_ALERT_TYPE,
  OPTIZMO_SYNC_ALERT_TYPE,
  collectEmailsFromCsvChunk,
  optizmoFirstDownloadAlertDedupeKey,
  optizmoSyncAlertDedupeKey,
  parseOptizmoEmailStream,
  processOptizmoSyncJob,
} from "./optizmo-sync.js"

const OFFER_ID = "019a0000-0000-7000-8000-0000000000aa"
const KEY = Buffer.alloc(32, 9).toString("base64")
const MAILER_KEY = "m-offer-key"
const ENC = encryptWithAppKey(MAILER_KEY, KEY)

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())
const recordIntegrationResult = vi.hoisted(() => vi.fn())

vi.mock("./alerts.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, openAlert, closeAlert }
})

vi.mock("./integration-sync-state.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, recordIntegrationResult }
})

const server = setupServer()

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  server.resetHandlers()
  openAlert.mockReset()
  closeAlert.mockReset()
  recordIntegrationResult.mockReset()
})

afterAll(() => {
  server.close()
})

function permanentFailure(message: string): Error {
  return Object.assign(new Error(message), { name: "UnrecoverableError" })
}

describe("optizmo-sync helpers", () => {
  it("collects and normalises emails from csv rows", () => {
    expect(
      collectEmailsFromCsvChunk(
        [["Email"], ["  A@Example.com "], ["bad"], ["b@example.com"]],
        0
      )
    ).toEqual(["a@example.com", "b@example.com"])
  })

  it("parses a streamed csv without loading the whole file", async () => {
    const stream = Readable.from([
      "email\n",
      "one@example.com\n",
      "two@example.com\n",
    ])
    const emails = await parseOptizmoEmailStream(stream)
    expect([...emails].sort()).toEqual(["one@example.com", "two@example.com"])
  })
})

describe("processOptizmoSyncJob", () => {
  beforeEach(() => {
    openAlert.mockResolvedValue({ created: true, alert: {} })
    closeAlert.mockResolvedValue({ closed: true, alert: {} })
    recordIntegrationResult.mockResolvedValue({})
  })

  it("syncs via msw fixture and upserts suppressions", async () => {
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${MAILER_KEY}`,
        () => HttpResponse.text("ok")
      ),
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${MAILER_KEY}`,
        () => HttpResponse.text("email\nalice@example.com\nbob@example.com\n")
      )
    )

    const inserted: unknown[] = []
    const updates: unknown[] = []
    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: ENC,
    }

    const db = {
      select: vi.fn(() => ({
        from: (table: unknown) => {
          if (table === offer) {
            return {
              where: () => ({
                limit: async () => [offerRow],
              }),
            }
          }
          return {
            where: async () => [],
          }
        },
      })),
      insert: vi.fn((table: unknown) => ({
        values: (values: unknown) => ({
          returning: async () => {
            if (table === suppressionSyncRun) {
              return [{ id: "run-1" }]
            }
            inserted.push(values)
            if (Array.isArray(values)) {
              return values.map((_, index) => ({ id: `ins-${String(index)}` }))
            }
            return [{ id: "ins-0" }]
          },
          onConflictDoNothing: () => ({
            returning: async () => {
              inserted.push(values)
              if (Array.isArray(values)) {
                return values.map((_, index) => ({
                  id: `ins-${String(index)}`,
                }))
              }
              return [{ id: "ins-0" }]
            },
          }),
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: (values: unknown) => ({
          where: () => ({
            returning: async () => {
              updates.push({ table, values })
              if (table === suppressionEntry) {
                return []
              }
              return [{ id: "updated" }]
            },
          }),
        }),
      })),
    }

    const result = await processOptizmoSyncJob(
      { offer_id: OFFER_ID, trigger: "manual" },
      {
        db: db as never,
        env: { OPTIZMO_API_KEY: "api-secret", APP_ENCRYPTION_KEY: KEY },
        encryptionKey: KEY,
        permanentFailure,
      }
    )

    expect(result).toMatchObject({
      kind: "offer",
      offerId: OFFER_ID,
      emailsSeen: 2,
      rowsAdded: 2,
    })
    expect(closeAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: OPTIZMO_SYNC_ALERT_TYPE,
        dedupeKey: optizmoSyncAlertDedupeKey(OFFER_ID),
      })
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ name: "optizmo", ok: true })
    )
  })

  it("fails empty files without deleting existing suppressions", async () => {
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${MAILER_KEY}`,
        () => HttpResponse.text("ok")
      ),
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/getfile/${MAILER_KEY}`,
        () => HttpResponse.text("email\n")
      )
    )

    let suppressionUpdates = 0
    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: ENC,
    }
    const db = {
      select: vi.fn(() => ({
        from: (table: unknown) => {
          if (table === offer) {
            return {
              where: () => ({
                limit: async () => [offerRow],
              }),
            }
          }
          return { where: async () => [] }
        },
      })),
      insert: vi.fn((table: unknown) => ({
        values: () => ({
          returning: async () => {
            if (table === suppressionSyncRun) {
              return [{ id: "run-empty" }]
            }
            return []
          },
          onConflictDoNothing: () => ({
            returning: async () => [],
          }),
        }),
      })),
      update: vi.fn((table: unknown) => ({
        set: () => ({
          where: () => ({
            returning: async () => {
              if (table === suppressionEntry) {
                suppressionUpdates += 1
              }
              return [{ id: "x" }]
            },
          }),
        }),
      })),
    }

    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID, trigger: "scheduled" },
        {
          db: db as never,
          env: { OPTIZMO_API_KEY: "api-secret" },
          encryptionKey: KEY,
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })

    expect(suppressionUpdates).toBe(0)
    expect(openAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: OPTIZMO_SYNC_ALERT_TYPE,
        dedupeKey: optizmoSyncAlertDedupeKey(OFFER_ID),
      })
    )
  })

  it("alerts when Optizmo refuses the first download", async () => {
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${MAILER_KEY}`,
        () =>
          HttpResponse.text("First download must be completed manually", {
            status: 403,
          })
      )
    )

    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: ENC,
    }
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [offerRow],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [{ id: "run-first" }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: "x" }],
          }),
        }),
      })),
    }

    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: db as never,
          env: { OPTIZMO_API_KEY: "api-secret" },
          encryptionKey: KEY,
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })

    expect(openAlert).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        type: OPTIZMO_FIRST_DOWNLOAD_ALERT_TYPE,
        dedupeKey: optizmoFirstDownloadAlertDedupeKey(OFFER_ID),
      })
    )
  })

  it("fans out one job per active offer when payload has no offer_id", async () => {
    const add = vi.fn(async () => undefined)
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => [
            { id: OFFER_ID },
            { id: "019a0000-0000-7000-8000-0000000000bb" },
          ],
        }),
      })),
    }

    const result = await processOptizmoSyncJob(
      {},
      {
        db: db as never,
        env: {},
        syncQueue: { add, getJob: vi.fn() },
        now: new Date("2026-11-17T08:00:00.000Z"),
        permanentFailure,
      }
    )

    expect(result).toEqual({ kind: "fanout", enqueued: 2 })
    expect(add).toHaveBeenCalledTimes(2)
  })

  it("requires a sync queue for fan-out", async () => {
    await expect(
      processOptizmoSyncJob(
        {},
        {
          db: { select: vi.fn() } as never,
          env: {},
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })
  })

  it("rejects missing inactive and keyless offers", async () => {
    const dbMissing = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })),
    }
    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: dbMissing as never,
          env: {},
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })

    const dbInactive = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: OFFER_ID,
                status: "paused",
                hasOptizmoMailerAccessKey: true,
                optizmoMailerAccessKeyEncrypted: ENC,
              },
            ],
          }),
        }),
      })),
    }
    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: dbInactive as never,
          env: {},
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })

    const dbNoKey = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: OFFER_ID,
                status: "active",
                hasOptizmoMailerAccessKey: false,
                optizmoMailerAccessKeyEncrypted: null,
              },
            ],
          }),
        }),
      })),
    }
    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: dbNoKey as never,
          env: {},
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })
  })

  it("fails permanently when OPTIZMO_API_KEY is missing", async () => {
    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: ENC,
    }
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [offerRow],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [{ id: "run-cfg" }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: "x" }],
          }),
        }),
      })),
    }

    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: db as never,
          env: {},
          encryptionKey: KEY,
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })
  })

  it("fails permanently when mailer key cannot be decrypted", async () => {
    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: "not.a.valid.payload",
    }
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [offerRow],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [{ id: "run-dec" }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: "x" }],
          }),
        }),
      })),
    }

    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: db as never,
          env: { OPTIZMO_API_KEY: "api-secret" },
          encryptionKey: KEY,
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({ name: "UnrecoverableError" })
  })

  it("rethrows retryable Optizmo HTTP errors for worker backoff", async () => {
    server.use(
      http.get(
        `${OPTIZMO_DEFAULT_BASE_URL}/accesskey/download/${MAILER_KEY}`,
        () => HttpResponse.text("busy", { status: 503 })
      )
    )

    const offerRow = {
      id: OFFER_ID,
      status: "active",
      hasOptizmoMailerAccessKey: true,
      optizmoMailerAccessKeyEncrypted: ENC,
    }
    const db = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [offerRow],
          }),
        }),
      })),
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => [{ id: "run-retry" }],
        }),
      })),
      update: vi.fn(() => ({
        set: () => ({
          where: () => ({
            returning: async () => [{ id: "x" }],
          }),
        }),
      })),
    }

    await expect(
      processOptizmoSyncJob(
        { offer_id: OFFER_ID },
        {
          db: db as never,
          env: { OPTIZMO_API_KEY: "api-secret" },
          encryptionKey: KEY,
          permanentFailure,
        }
      )
    ).rejects.toMatchObject({
      name: "OptizmoClientError",
      code: "http",
      retryable: true,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"
import type * as SharedModule from "@workspace/shared"
import { AppError } from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const recordIntegrationResult = vi.hoisted(() => vi.fn())
const encryptWithAppKey = vi.hoisted(() => vi.fn())
const readAppEncryptionKeyFromEnv = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    writeAudit,
    recordIntegrationResult,
  }
})

vi.mock("@/lib/crypto/app-encryption", () => ({
  encryptWithAppKey,
  readAppEncryptionKeyFromEnv,
}))

import {
  getOfferByEverflowId,
  importOfferFromEverflow,
  listOffers,
} from "./service"

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "insert",
    "values",
    "returning",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

const at = new Date("2026-11-05T12:00:00.000Z")

const storedOffer = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  name: "Q4 relaunch",
  externalRef: "2049",
  everflowOfferId: 2049,
  status: "active" as const,
  approvedSubjectLines: ["Subject A"],
  approvedFromLines: ["From A"],
  trackingLinks: {
    tracking_url: "https://track.example/x",
    impression_tracking_url: null,
    redirect_tracking_url: null,
    urls: [],
  },
  creatives: [],
  unsubscribeUrl: "https://unsub.example/o",
  suppressionFileUrl: null,
  optizmoMailerAccessKeyEncrypted: "enc.key",
  hasOptizmoMailerAccessKey: true,
  lastSyncedAt: at,
  createdAt: at,
  updatedAt: at,
}

describe("listOffers", () => {
  it("returns serialized active offers", async () => {
    const db = {
      select: vi.fn(() => query([storedOffer])),
    }

    await expect(
      listOffers({ limit: 50, status: "active" }, db as never as Database)
    ).resolves.toEqual({
      data: [
        {
          id: storedOffer.id,
          name: storedOffer.name,
          external_ref: "2049",
          everflow_offer_id: 2049,
          status: "active",
          has_optizmo_mailer_access_key: true,
          last_synced_at: at.toISOString(),
        },
      ],
    })
  })
})

describe("getOfferByEverflowId", () => {
  it("returns detail when found", async () => {
    const db = {
      select: vi.fn(() => query([storedOffer])),
    }
    await expect(
      getOfferByEverflowId(2049, db as never as Database)
    ).resolves.toMatchObject({
      everflow_offer_id: 2049,
      has_optizmo_mailer_access_key: true,
    })
  })

  it("throws not_found when missing", async () => {
    const db = {
      select: vi.fn(() => query([])),
    }
    await expect(
      getOfferByEverflowId(2049, db as never as Database)
    ).rejects.toMatchObject({ code: "not_found" })
  })
})

describe("importOfferFromEverflow", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({ id: "audit" })
    recordIntegrationResult.mockReset()
    recordIntegrationResult.mockResolvedValue({})
    encryptWithAppKey.mockReset()
    encryptWithAppKey.mockReturnValue("enc.key")
    readAppEncryptionKeyFromEnv.mockReset()
    readAppEncryptionKeyFromEnv.mockReturnValue("test-key-material")
  })

  it("creates an offer, encrypts the mailer key, and never returns it", async () => {
    const insertReturning = vi.fn().mockResolvedValue([storedOffer])
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: insertReturning,
        })),
      })),
    }
    const db = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(tx)
      ),
    }

    const result = await importOfferFromEverflow(
      2049,
      { userId: "user-1", requestId: "req-1" },
      {
        db: db as never as Database,
        now: at,
        fetchOffer: async () => ({
          network_offer_id: 2049,
          name: "Q4 relaunch",
          offer_status: "active",
          tracking_url: "https://track.example/x",
          impression_tracking_url: null,
          redirect_tracking_url: null,
          subject_lines: ["Subject A"],
          from_lines: ["From A"],
          creatives: [],
          urls: [],
          unsubscribe_url: "https://unsub.example/o",
          suppression_file_url: null,
          optizmo_mailer_access_key: "m-test-key",
        }),
      }
    )

    expect(encryptWithAppKey).toHaveBeenCalledWith(
      "m-test-key",
      "test-key-material"
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ name: "everflow", ok: true })
    )
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "offer.imported",
        after: expect.objectContaining({
          everflow_offer_id: 2049,
          has_optizmo_mailer_access_key: true,
        }),
      })
    )
    expect(JSON.stringify(result)).not.toContain("m-test-key")
    expect(JSON.stringify(result)).not.toContain("enc.key")
    expect(result.has_optizmo_mailer_access_key).toBe(true)
  })

  it("records integration failure when Everflow fetch fails", async () => {
    const db = {
      transaction: vi.fn(),
    }
    await expect(
      importOfferFromEverflow(
        2049,
        { userId: "user-1" },
        {
          db: db as never as Database,
          now: at,
          fetchOffer: async () => {
            throw AppError.unavailable([
              { path: "everflow", message: "timeout" },
            ])
          },
        }
      )
    ).rejects.toMatchObject({ code: "unavailable" })

    expect(recordIntegrationResult).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        name: "everflow",
        ok: false,
        error: "timeout",
      })
    )
    expect(db.transaction).not.toHaveBeenCalled()
  })
})

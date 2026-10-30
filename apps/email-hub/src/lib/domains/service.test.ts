import { beforeEach, describe, expect, it, vi } from "vitest"

import { SesIdentityError } from "@workspace/emails"
import type * as SharedModule from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    writeAudit,
    loadServerEnv: () => ({ SES_REGION: "us-east-1" }),
  }
})

import { createDomain } from "./service"

describe("createDomain", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("does not open a DB transaction when SES provisioning fails", async () => {
    const transaction = vi.fn()

    await expect(
      createDomain(
        "example.com",
        { userId: "019a0000-0000-7000-8000-000000000001" },
        {
          db: { transaction } as never,
          sesRegion: "us-east-1",
          provision: async () => {
            throw new SesIdentityError("SES CreateEmailIdentity failed")
          },
        }
      )
    ).rejects.toMatchObject({ code: "unavailable", status: 503 })

    expect(transaction).not.toHaveBeenCalled()
  })

  it("writes domain, dns records, setup steps, and audit after SES succeeds", async () => {
    const domainRow = {
      id: "019a0000-0000-7000-8000-0000000000aa",
      name: "example.com",
      sesIdentityArn: "arn:aws:ses:us-east-1:1:identity/example.com",
      status: "pending" as const,
      createdBy: "019a0000-0000-7000-8000-000000000001",
      createdAt: new Date("2026-10-30T00:00:00.000Z"),
      updatedAt: new Date("2026-10-30T00:00:00.000Z"),
      verifiedAt: null,
    }
    const dnsRows = [
      {
        id: "019a0000-0000-7000-8000-0000000000b1",
        domainId: domainRow.id,
        purpose: "dkim" as const,
        name: "t1._domainkey.example.com",
        recordType: "CNAME",
        expectedValue: "t1.dkim.amazonses.com",
        lastSeenValue: null,
        status: "pending" as const,
        lastCheckedAt: null,
        createdAt: domainRow.createdAt,
        updatedAt: domainRow.updatedAt,
      },
    ]
    const stepRows = [
      {
        id: "019a0000-0000-7000-8000-0000000000c1",
        domainId: domainRow.id,
        step: "ses_identity" as const,
        status: "done" as const,
        error: null,
        startedAt: domainRow.createdAt,
        completedAt: domainRow.createdAt,
        updatedAt: domainRow.updatedAt,
      },
      {
        id: "019a0000-0000-7000-8000-0000000000c2",
        domainId: domainRow.id,
        step: "dns_records" as const,
        status: "done" as const,
        error: null,
        startedAt: domainRow.createdAt,
        completedAt: domainRow.createdAt,
        updatedAt: domainRow.updatedAt,
      },
      {
        id: "019a0000-0000-7000-8000-0000000000c3",
        domainId: domainRow.id,
        step: "verification" as const,
        status: "pending" as const,
        error: null,
        startedAt: null,
        completedAt: null,
        updatedAt: domainRow.updatedAt,
      },
    ]

    let insertCall = 0
    const tx = {
      insert: vi.fn(() => ({
        values: () => ({
          returning: async () => {
            insertCall += 1
            if (insertCall === 1) return [domainRow]
            if (insertCall === 2) return dnsRows
            return stepRows
          },
        }),
      })),
    }

    const result = await createDomain(
      "example.com",
      { userId: domainRow.createdBy, requestId: "req-1" },
      {
        db: {
          transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
            fn(tx),
        } as never,
        sesRegion: "us-east-1",
        provision: async () => ({
          emailIdentity: "example.com",
          identityArn: domainRow.sesIdentityArn,
          mailFromDomain: "mail.example.com",
          dkimTokens: ["t1", "t2", "t3"],
          dnsRecords: [
            {
              purpose: "dkim",
              name: "t1._domainkey.example.com",
              recordType: "CNAME",
              expectedValue: "t1.dkim.amazonses.com",
            },
          ],
        }),
      }
    )

    expect(result).toMatchObject({
      name: "example.com",
      status: "pending",
      ses_identity_arn: domainRow.sesIdentityArn,
    })
    expect(result.dns_records).toHaveLength(1)
    expect(result.setup_steps).toHaveLength(3)
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "domain.create",
        objectType: "domain",
        objectId: domainRow.id,
      })
    )
  })
})

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

import { CloudflareDnsError } from "./cloudflare-dns"
import { createDomain, deleteDomain } from "./service"

describe("createDomain", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("does not open a DB transaction when SES provisioning fails", async () => {
    const transaction = vi.fn()
    const upsertCloudflareDns = vi.fn()

    await expect(
      createDomain(
        { name: "example.com" },
        { userId: "019a0000-0000-7000-8000-000000000001" },
        {
          db: { transaction } as never,
          sesRegion: "us-east-1",
          upsertCloudflareDns,
          provision: async () => {
            throw new SesIdentityError("SES CreateEmailIdentity failed")
          },
        }
      )
    ).rejects.toMatchObject({ code: "unavailable", status: 503 })

    expect(transaction).not.toHaveBeenCalled()
    expect(upsertCloudflareDns).not.toHaveBeenCalled()
  })

  it("skips Cloudflare when the API token is not configured", async () => {
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
        purpose: "spf" as const,
        name: "example.com",
        recordType: "TXT",
        expectedValue: "v=spf1 include:amazonses.com ~all",
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
    const upsertCloudflareDns = vi.fn()

    await createDomain(
      { name: "example.com" },
      { userId: domainRow.createdBy },
      {
        db: {
          transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
            fn(tx),
        } as never,
        sesRegion: "us-east-1",
        cloudflare: { apiToken: "" },
        upsertCloudflareDns,
        provision: async () => ({
          emailIdentity: "example.com",
          identityArn: domainRow.sesIdentityArn,
          mailFromDomain: null,
          dkimTokens: ["t1", "t2", "t3"],
          dnsRecords: [
            {
              purpose: "spf" as const,
              name: "example.com",
              recordType: "TXT",
              expectedValue: "v=spf1 include:amazonses.com ~all",
            },
          ],
        }),
      }
    )

    expect(upsertCloudflareDns).not.toHaveBeenCalled()
  })

  it("does not open a DB transaction when Cloudflare DNS fails", async () => {
    const transaction = vi.fn()

    await expect(
      createDomain(
        { name: "example.com" },
        { userId: "019a0000-0000-7000-8000-000000000001" },
        {
          db: { transaction } as never,
          sesRegion: "us-east-1",
          cloudflare: { apiToken: "token" },
          provision: async () => ({
            emailIdentity: "example.com",
            identityArn: "arn:aws:ses:us-east-1:identity/example.com",
            mailFromDomain: null,
            dkimTokens: ["t1", "t2", "t3"],
            dnsRecords: [],
          }),
          upsertCloudflareDns: async () => {
            throw new CloudflareDnsError("Cloudflare API error: denied")
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

    const provision = vi.fn(async () => ({
      emailIdentity: "example.com",
      identityArn: domainRow.sesIdentityArn,
      mailFromDomain: "bounce.example.com",
      dkimTokens: ["t1", "t2", "t3"],
      dnsRecords: [
        {
          purpose: "dkim" as const,
          name: "t1._domainkey.example.com",
          recordType: "CNAME",
          expectedValue: "t1.dkim.amazonses.com",
        },
      ],
    }))

    const upsertCloudflareDns = vi.fn(async () => ({
      upserted: 1,
      zone_id: "zone-1",
    }))

    const result = await createDomain(
      { name: "example.com", mailFromSubdomain: "bounce" },
      { userId: domainRow.createdBy, requestId: "req-1" },
      {
        db: {
          transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
            fn(tx),
        } as never,
        sesRegion: "us-east-1",
        cloudflare: { apiToken: "cf-token" },
        provision,
        upsertCloudflareDns,
      }
    )

    expect(upsertCloudflareDns).toHaveBeenCalledWith(
      "example.com",
      expect.any(Array),
      { apiToken: "cf-token" }
    )

    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        domainName: "example.com",
        mailFromSubdomain: "bounce",
      })
    )
    expect(result).toMatchObject({
      name: "example.com",
      status: "pending",
      ses_identity_arn: domainRow.sesIdentityArn,
      ses_region: "us-east-1",
      sender_count: 0,
      last_checked_at: null,
      dns_summary: {
        spf: "pending",
        dkim: "pending",
        dmarc: "pending",
        mail_from: "pass",
      },
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

describe("deleteDomain", () => {
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

  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("does not open a DB transaction when SES delete fails", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
    const transaction = vi.fn()
    const deleteIdentity = vi.fn(async () => {
      throw new SesIdentityError("SES DeleteEmailIdentity failed: boom")
    })

    await expect(
      deleteDomain(
        "example.com",
        { userId: domainRow.createdBy },
        {
          db: { select, transaction } as never,
          sesRegion: "us-east-1",
          deleteIdentity,
          deleteCloudflareDns: vi.fn(),
        }
      )
    ).rejects.toMatchObject({ code: "unavailable", status: 503 })

    expect(deleteIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        domainName: "example.com",
        region: "us-east-1",
      })
    )
    expect(transaction).not.toHaveBeenCalled()
  })

  it("conflicts when any sender still references the domain", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: "019a0000-0000-7000-8000-0000000000bb" }],
          }),
        }),
      })
    const transaction = vi.fn()
    const deleteIdentity = vi.fn()

    await expect(
      deleteDomain(
        "example.com",
        { userId: domainRow.createdBy },
        {
          db: { select, transaction } as never,
          sesRegion: "us-east-1",
          deleteIdentity,
        }
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })

    expect(deleteIdentity).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it("deletes SES then the domain row", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })

    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })),
      delete: vi.fn(() => ({
        where: async () => undefined,
      })),
    }
    const deleteIdentity = vi.fn(async () => ({
      deleted: true,
      skippedBecauseAccessDenied: false,
    }))
    const deleteCloudflareDns = vi.fn(async () => ({ deleted: 0 }))

    await expect(
      deleteDomain(
        "example.com",
        { userId: domainRow.createdBy, requestId: "req-del" },
        {
          db: {
            select,
            transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
              fn(tx),
          } as never,
          sesRegion: "us-east-1",
          deleteIdentity,
          deleteCloudflareDns,
        }
      )
    ).resolves.toEqual({ ses_deleted: true, cloudflare_deleted: true })

    expect(deleteIdentity).toHaveBeenCalled()
    expect(deleteCloudflareDns).toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "domain.delete",
        objectType: "domain",
        objectId: domainRow.id,
        requestId: "req-del",
      })
    )
  })

  it("still deletes the DB row when SES AccessDenied soft-fails", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })

    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })),
      delete: vi.fn(() => ({
        where: async () => undefined,
      })),
    }

    await expect(
      deleteDomain(
        "example.com",
        { userId: domainRow.createdBy },
        {
          db: {
            select,
            transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
              fn(tx),
          } as never,
          sesRegion: "us-east-1",
          deleteIdentity: async () => ({
            deleted: false,
            skippedBecauseAccessDenied: true,
          }),
          deleteCloudflareDns: async () => ({ deleted: 0 }),
        }
      )
    ).resolves.toEqual({ ses_deleted: false, cloudflare_deleted: true })

    expect(tx.delete).toHaveBeenCalled()
  })

  it("marks cloudflare_deleted false when Cloudflare cleanup fails", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [
              {
                purpose: "dkim" as const,
                name: "t1._domainkey.example.com",
                recordType: "CNAME",
                expectedValue: "t1.dkim.amazonses.com",
              },
            ],
          }),
        }),
      })

    const tx = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: async () => [domainRow],
          }),
        }),
      })),
      delete: vi.fn(() => ({
        where: async () => undefined,
      })),
    }

    await expect(
      deleteDomain(
        "example.com",
        { userId: domainRow.createdBy },
        {
          db: {
            select,
            transaction: async (fn: (inner: typeof tx) => Promise<unknown>) =>
              fn(tx),
          } as never,
          sesRegion: "us-east-1",
          deleteIdentity: async () => ({
            deleted: true,
            skippedBecauseAccessDenied: false,
          }),
          deleteCloudflareDns: async () => {
            throw new CloudflareDnsError(
              "CLOUDFLARE_API_TOKEN is not configured"
            )
          },
        }
      )
    ).resolves.toEqual({ ses_deleted: true, cloudflare_deleted: false })

    expect(tx.delete).toHaveBeenCalled()
  })
})

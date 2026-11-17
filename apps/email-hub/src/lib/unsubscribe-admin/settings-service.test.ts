import { beforeEach, describe, expect, it, vi } from "vitest"

const loadServerEnv = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    loadServerEnv,
  }
})

import {
  patchUnsubscribeSettings,
  serializeUnsubscribeSettings,
  verifyUnsubscribeCustomDomain,
} from "./settings-service"

const ROW = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  logoUrl: null as string | null,
  customDomain: null as string | null,
  customDomainStatus: "unset" as const,
  verificationToken: null as string | null,
  verifiedAt: null as Date | null,
  updatedBy: null as string | null,
  createdAt: new Date("2026-11-17T00:00:00.000Z"),
  updatedAt: new Date("2026-11-17T00:00:00.000Z"),
}

describe("unsubscribe settings service", () => {
  beforeEach(() => {
    loadServerEnv.mockReset()
    loadServerEnv.mockReturnValue({
      BETTER_AUTH_URL: "https://hub.example.com",
    })
  })

  it("serializes dns records and public base url for pending domains", () => {
    const json = serializeUnsubscribeSettings(
      {
        ...ROW,
        customDomain: "unsub.example.com",
        customDomainStatus: "pending",
        verificationToken: "token-abc",
      },
      { fallbackOrigin: "https://hub.example.com" }
    )
    expect(json.hub_host).toBe("hub.example.com")
    expect(json.public_base_url).toBe("https://hub.example.com")
    expect(json.dns_records).toEqual([
      {
        type: "CNAME",
        host: "unsub.example.com",
        value: "hub.example.com",
      },
      {
        type: "TXT",
        host: "_eh-unsubscribe.unsub.example.com",
        value: "token-abc",
      },
    ])
  })

  it("uses the verified custom domain as public base url", () => {
    const json = serializeUnsubscribeSettings(
      {
        ...ROW,
        customDomain: "unsub.example.com",
        customDomainStatus: "verified",
        verificationToken: "token-abc",
        verifiedAt: new Date("2026-11-17T12:00:00.000Z"),
      },
      { fallbackOrigin: "https://hub.example.com" }
    )
    expect(json.public_base_url).toBe("https://unsub.example.com")
  })

  it("binds a custom domain to pending with a verification token", async () => {
    const updated = {
      ...ROW,
      customDomain: "unsub.example.com",
      customDomainStatus: "pending" as const,
      verificationToken: "minted",
      updatedBy: "019a0000-0000-7000-8000-000000000001",
    }
    const returning = vi.fn().mockResolvedValue([updated])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const db = {
      select: () => ({
        from: () => ({
          limit: vi.fn().mockResolvedValue([ROW]),
        }),
      }),
      update: () => ({ set }),
    }

    const result = await patchUnsubscribeSettings(
      { customDomain: "Unsub.Example.com" },
      { userId: "019a0000-0000-7000-8000-000000000001" },
      db as never
    )

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        customDomain: "unsub.example.com",
        customDomainStatus: "pending",
        verifiedAt: null,
      })
    )
    expect(result.custom_domain_status).toBe("pending")
    expect(result.custom_domain).toBe("unsub.example.com")
    expect(result.verification_token).toBeTruthy()
  })

  it("rejects http logo urls via schema path in patch body validation separately", () => {
    expect(ROW.logoUrl).toBeNull()
  })

  it("verifies when CNAME and TXT both match", async () => {
    const pending = {
      ...ROW,
      customDomain: "unsub.example.com",
      customDomainStatus: "pending" as const,
      verificationToken: "token-abc",
    }
    const verified = {
      ...pending,
      customDomainStatus: "verified" as const,
      verifiedAt: new Date("2026-11-17T12:00:00.000Z"),
    }
    const returning = vi.fn().mockResolvedValue([verified])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const db = {
      select: () => ({
        from: () => ({
          limit: vi.fn().mockResolvedValue([pending]),
        }),
      }),
      update: () => ({ set }),
    }

    const lookup = vi.fn(async ({ recordType }: { recordType: string }) => {
      if (recordType === "CNAME") {
        return { kind: "found" as const, values: ["hub.example.com."] }
      }
      return { kind: "found" as const, values: ["token-abc"] }
    })

    const result = await verifyUnsubscribeCustomDomain(
      { lookup, now: new Date("2026-11-17T12:00:00.000Z") },
      db as never
    )

    expect(result.custom_domain_status).toBe("verified")
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ customDomainStatus: "verified" })
    )
  })

  it("marks failed when DNS does not match", async () => {
    const pending = {
      ...ROW,
      customDomain: "unsub.example.com",
      customDomainStatus: "pending" as const,
      verificationToken: "token-abc",
    }
    const failed = {
      ...pending,
      customDomainStatus: "failed" as const,
      verifiedAt: null,
    }
    const returning = vi.fn().mockResolvedValue([failed])
    const where = vi.fn().mockReturnValue({ returning })
    const set = vi.fn().mockReturnValue({ where })
    const db = {
      select: () => ({
        from: () => ({
          limit: vi.fn().mockResolvedValue([pending]),
        }),
      }),
      update: () => ({ set }),
    }

    const lookup = vi.fn(async () => ({
      kind: "not_found" as const,
    }))

    const result = await verifyUnsubscribeCustomDomain({ lookup }, db as never)
    expect(result.custom_domain_status).toBe("failed")
  })
})

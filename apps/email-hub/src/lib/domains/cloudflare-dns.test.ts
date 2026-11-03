import { describe, expect, it, vi } from "vitest"

import {
  deleteCloudflareDnsRecords,
  isCloudflareDnsConfigured,
  mergeSesSpfInclude,
  upsertCloudflareDnsRecords,
} from "./cloudflare-dns"

describe("mergeSesSpfInclude", () => {
  it("adds amazonses include before the all mechanism", () => {
    expect(mergeSesSpfInclude("v=spf1 include:_spf.google.com ~all")).toBe(
      "v=spf1 include:_spf.google.com include:amazonses.com ~all"
    )
  })

  it("is idempotent when amazonses is already present", () => {
    expect(
      mergeSesSpfInclude(
        "v=spf1 include:amazonses.com include:_spf.google.com ~all"
      )
    ).toBe("v=spf1 include:amazonses.com include:_spf.google.com ~all")
  })

  it("replaces non-spf content with a SES-only record", () => {
    expect(mergeSesSpfInclude("not-spf")).toBe(
      "v=spf1 include:amazonses.com ~all"
    )
  })
})

describe("isCloudflareDnsConfigured", () => {
  it("reads the explicit deps token", () => {
    expect(isCloudflareDnsConfigured({ apiToken: "token" })).toBe(true)
    expect(isCloudflareDnsConfigured({ apiToken: "  " })).toBe(false)
  })
})

describe("upsertCloudflareDnsRecords", () => {
  it("returns early for an empty record list", async () => {
    await expect(
      upsertCloudflareDnsRecords("example.com", [], {
        apiToken: "token",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      })
    ).resolves.toEqual({ upserted: 0, zone_id: "" })
  })

  it("resolves the zone and creates missing records in parallel", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("/zones?") && method === "GET") {
          return Response.json({
            success: true,
            result: [{ id: "zone-1", name: "example.com" }],
          })
        }
        if (url.includes("/dns_records?") && method === "GET") {
          return Response.json({ success: true, result: [] })
        }
        if (url.endsWith("/dns_records") && method === "POST") {
          return Response.json({ success: true, result: { id: "rec-1" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await upsertCloudflareDnsRecords(
      "mail.example.com",
      [
        {
          purpose: "dkim",
          name: "t1._domainkey.mail.example.com",
          recordType: "CNAME",
          expectedValue: "t1.dkim.amazonses.com",
        },
        {
          purpose: "dmarc",
          name: "_dmarc.mail.example.com",
          recordType: "TXT",
          expectedValue: "v=DMARC1; p=none;",
        },
      ],
      { apiToken: "token", fetchImpl: fetchImpl as unknown as typeof fetch }
    )

    expect(result).toEqual({ upserted: 2, zone_id: "zone-1" })
    const posts = fetchImpl.mock.calls.filter(
      ([, init]) => (init?.method ?? "GET") === "POST"
    )
    expect(posts).toHaveLength(2)
  })

  it("merges apex SPF instead of overwriting", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("/zones?") && method === "GET") {
          return Response.json({
            success: true,
            result: [{ id: "zone-1", name: "example.com" }],
          })
        }
        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "spf-1",
                type: "TXT",
                name: "example.com",
                content: "v=spf1 include:_spf.google.com ~all",
              },
            ],
          })
        }
        if (url.includes("/dns_records/spf-1") && method === "PUT") {
          return Response.json({ success: true, result: { id: "spf-1" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    await upsertCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    const putCall = fetchImpl.mock.calls.find(
      ([, init]) => (init?.method ?? "GET") === "PUT"
    )
    expect(putCall).toBeDefined()
    const body = JSON.parse(String(putCall?.[1]?.body ?? "{}")) as {
      content: string
    }
    expect(body.content).toContain("include:amazonses.com")
    expect(body.content).toContain("include:_spf.google.com")
  })

  it("creates MAIL FROM SPF and MX records", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("/dns_records?") && method === "GET") {
          return Response.json({ success: true, result: [] })
        }
        if (url.endsWith("/dns_records") && method === "POST") {
          return Response.json({ success: true, result: { id: "rec-1" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await upsertCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "mail.example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
        {
          purpose: "mx",
          name: "mail.example.com",
          recordType: "MX",
          expectedValue: "10 feedback-smtp.us-east-1.amazonses.com",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.upserted).toBe(2)
    const posts = fetchImpl.mock.calls.filter(
      ([, init]) => (init?.method ?? "GET") === "POST"
    )
    expect(posts).toHaveLength(2)
    const mxPost = posts
      .map(
        ([, init]) =>
          JSON.parse(String(init?.body ?? "{}")) as {
            type?: string
            priority?: number
            content?: string
          }
      )
      .find((body) => body.type === "MX")
    expect(mxPost).toMatchObject({
      type: "MX",
      priority: 10,
      content: "feedback-smtp.us-east-1.amazonses.com",
    })
  })

  it("updates an existing CNAME when the target differs", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=CNAME") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "dkim-old",
                type: "CNAME",
                name: "t1._domainkey.example.com",
                content: "old.dkim.amazonses.com",
              },
            ],
          })
        }
        if (url.includes("/dns_records/dkim-old") && method === "PUT") {
          return Response.json({ success: true, result: { id: "dkim-old" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    await upsertCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "dkim",
          name: "t1._domainkey.example.com",
          recordType: "CNAME",
          expectedValue: "t1.dkim.amazonses.com",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(
      fetchImpl.mock.calls.some(([, init]) => (init?.method ?? "GET") === "PUT")
    ).toBe(true)
  })

  it("throws when Cloudflare returns an API error", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { success: false, errors: [{ message: "rate limited" }] },
        { status: 429 }
      )
    )

    await expect(
      upsertCloudflareDnsRecords(
        "example.com",
        [
          {
            purpose: "dmarc",
            name: "_dmarc.example.com",
            recordType: "TXT",
            expectedValue: "v=DMARC1; p=none;",
          },
        ],
        {
          apiToken: "token",
          zoneId: "zone-1",
          fetchImpl: fetchImpl as unknown as typeof fetch,
        }
      )
    ).rejects.toMatchObject({
      name: "CloudflareDnsError",
      message: expect.stringContaining("rate limited"),
    })
  })

  it("throws when no zone matches the domain", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ success: true, result: [] })
    )

    await expect(
      upsertCloudflareDnsRecords(
        "example.com",
        [
          {
            purpose: "dmarc",
            name: "_dmarc.example.com",
            recordType: "TXT",
            expectedValue: "v=DMARC1; p=none;",
          },
        ],
        { apiToken: "token", fetchImpl: fetchImpl as unknown as typeof fetch }
      )
    ).rejects.toMatchObject({
      name: "CloudflareDnsError",
      message: expect.stringContaining("No Cloudflare zone found"),
    })
  })
})

describe("deleteCloudflareDnsRecords", () => {
  it("returns early for an empty record list", async () => {
    await expect(
      deleteCloudflareDnsRecords("example.com", [], {
        apiToken: "token",
        fetchImpl: vi.fn() as unknown as typeof fetch,
      })
    ).resolves.toEqual({ deleted: 0 })
  })

  it("deletes SES-owned DKIM and DMARC records for the domain", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=CNAME") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "dkim-1",
                type: "CNAME",
                name: "t1._domainkey.example.com",
                content: "t1.dkim.amazonses.com",
              },
            ],
          })
        }
        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "dmarc-1",
                type: "TXT",
                name: "_dmarc.example.com",
                content: "v=DMARC1; p=none;",
              },
            ],
          })
        }
        if (method === "DELETE") {
          return Response.json({ success: true, result: { id: "ok" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await deleteCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "dkim",
          name: "t1._domainkey.example.com",
          recordType: "CNAME",
          expectedValue: "t1.dkim.amazonses.com",
        },
        {
          purpose: "dmarc",
          name: "_dmarc.example.com",
          recordType: "TXT",
          expectedValue: "v=DMARC1; p=none;",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.deleted).toBe(2)
    expect(
      fetchImpl.mock.calls.filter(
        ([, init]) => (init?.method ?? "GET") === "DELETE"
      )
    ).toHaveLength(2)
  })

  it("unmerges apex SPF and keeps other includes", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "spf-1",
                type: "TXT",
                name: "example.com",
                content:
                  "v=spf1 include:_spf.google.com include:amazonses.com ~all",
              },
            ],
          })
        }
        if (url.includes("/dns_records/spf-1") && method === "PUT") {
          return Response.json({ success: true, result: { id: "spf-1" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await deleteCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.deleted).toBe(1)
    const putCall = fetchImpl.mock.calls.find(
      ([, init]) => (init?.method ?? "GET") === "PUT"
    )
    const body = JSON.parse(String(putCall?.[1]?.body ?? "{}")) as {
      content: string
    }
    expect(body.content).toContain("include:_spf.google.com")
    expect(body.content).not.toContain("amazonses.com")
  })

  it("deletes apex SPF when only amazonses remains", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "spf-1",
                type: "TXT",
                name: "example.com",
                content: "v=spf1 include:amazonses.com ~all",
              },
            ],
          })
        }
        if (method === "DELETE") {
          return Response.json({ success: true, result: { id: "ok" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await deleteCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.deleted).toBe(1)
    expect(
      fetchImpl.mock.calls.some(
        ([, init]) => (init?.method ?? "GET") === "DELETE"
      )
    ).toBe(true)
  })

  it("skips apex SPF when amazonses is already absent", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "spf-1",
                type: "TXT",
                name: "example.com",
                content: "v=spf1 include:_spf.google.com ~all",
              },
            ],
          })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await deleteCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.deleted).toBe(0)
    expect(
      fetchImpl.mock.calls.some(
        ([, init]) =>
          (init?.method ?? "GET") === "DELETE" ||
          (init?.method ?? "GET") === "PUT"
      )
    ).toBe(false)
  })

  it("deletes MAIL FROM SPF and MX hostnames", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? "GET"

        if (url.includes("type=TXT") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "spf-mail",
                type: "TXT",
                name: "mail.example.com",
                content: "v=spf1 include:amazonses.com ~all",
              },
            ],
          })
        }
        if (url.includes("type=MX") && method === "GET") {
          return Response.json({
            success: true,
            result: [
              {
                id: "mx-1",
                type: "MX",
                name: "mail.example.com",
                content: "feedback-smtp.us-east-1.amazonses.com",
                priority: 10,
              },
            ],
          })
        }
        if (method === "DELETE") {
          return Response.json({ success: true, result: { id: "ok" } })
        }
        return Response.json(
          { success: false, errors: [{ message: url }] },
          { status: 400 }
        )
      }
    )

    const result = await deleteCloudflareDnsRecords(
      "example.com",
      [
        {
          purpose: "spf",
          name: "mail.example.com",
          recordType: "TXT",
          expectedValue: "v=spf1 include:amazonses.com ~all",
        },
        {
          purpose: "mx",
          name: "mail.example.com",
          recordType: "MX",
          expectedValue: "10 feedback-smtp.us-east-1.amazonses.com",
        },
      ],
      {
        apiToken: "token",
        zoneId: "zone-1",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }
    )

    expect(result.deleted).toBe(2)
  })

  it("throws when CLOUDFLARE_API_TOKEN is missing", async () => {
    await expect(
      deleteCloudflareDnsRecords(
        "example.com",
        [
          {
            purpose: "dkim",
            name: "t1._domainkey.example.com",
            recordType: "CNAME",
            expectedValue: "t1.dkim.amazonses.com",
          },
        ],
        { apiToken: "", fetchImpl: vi.fn() as unknown as typeof fetch }
      )
    ).rejects.toMatchObject({
      name: "CloudflareDnsError",
      message: expect.stringContaining("CLOUDFLARE_API_TOKEN"),
    })
  })
})

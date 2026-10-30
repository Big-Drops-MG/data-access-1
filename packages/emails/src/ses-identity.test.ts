import { describe, expect, it, vi } from "vitest"

import {
  buildDnsRecordsFromSes,
  mailFromDomainFor,
  provisionSesDomainIdentity,
  SesIdentityError,
} from "./ses-identity.js"

describe("mailFromDomainFor", () => {
  it("prefixes mail.", () => {
    expect(mailFromDomainFor("e.quotifii.com")).toBe("mail.e.quotifii.com")
  })
})

describe("buildDnsRecordsFromSes", () => {
  it("builds 3 DKIM + SPF + DMARC + MAIL FROM MX + MAIL FROM SPF", () => {
    const records = buildDnsRecordsFromSes({
      domainName: "example.com",
      region: "us-east-1",
      dkimTokens: ["aaa", "bbb", "ccc"],
      mailFromDomain: "mail.example.com",
    })

    expect(records).toHaveLength(7)
    expect(records.filter((r) => r.purpose === "dkim")).toEqual([
      {
        purpose: "dkim",
        name: "aaa._domainkey.example.com",
        recordType: "CNAME",
        expectedValue: "aaa.dkim.amazonses.com",
      },
      {
        purpose: "dkim",
        name: "bbb._domainkey.example.com",
        recordType: "CNAME",
        expectedValue: "bbb.dkim.amazonses.com",
      },
      {
        purpose: "dkim",
        name: "ccc._domainkey.example.com",
        recordType: "CNAME",
        expectedValue: "ccc.dkim.amazonses.com",
      },
    ])
    expect(records).toContainEqual({
      purpose: "spf",
      name: "example.com",
      recordType: "TXT",
      expectedValue: "v=spf1 include:amazonses.com ~all",
    })
    expect(records).toContainEqual({
      purpose: "dmarc",
      name: "_dmarc.example.com",
      recordType: "TXT",
      expectedValue: "v=DMARC1; p=none;",
    })
    expect(records).toContainEqual({
      purpose: "mx",
      name: "mail.example.com",
      recordType: "MX",
      expectedValue: "10 feedback-smtp.us-east-1.amazonses.com",
    })
    expect(records).toContainEqual({
      purpose: "spf",
      name: "mail.example.com",
      recordType: "TXT",
      expectedValue: "v=spf1 include:amazonses.com ~all",
    })
  })
})

describe("provisionSesDomainIdentity", () => {
  it("calls CreateEmailIdentity then PutMailFrom and maps DNS from tokens", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "CreateEmailIdentityCommand") {
        return {
          DkimAttributes: { Tokens: ["t1", "t2", "t3"] },
        }
      }
      return {}
    })

    const result = await provisionSesDomainIdentity({
      domainName: "Example.COM",
      region: "us-east-1",
      client: { send },
    })

    expect(send).toHaveBeenCalledTimes(2)
    expect(result.emailIdentity).toBe("example.com")
    expect(result.identityArn).toBe(
      "arn:aws:ses:us-east-1:identity/example.com"
    )
    expect(result.dkimTokens).toEqual(["t1", "t2", "t3"])
    expect(result.dnsRecords).toHaveLength(7)
  })

  it("throws SesIdentityError when CreateEmailIdentity fails", async () => {
    await expect(
      provisionSesDomainIdentity({
        domainName: "example.com",
        region: "us-east-1",
        client: {
          send: async () => {
            throw new Error("boom")
          },
        },
      })
    ).rejects.toBeInstanceOf(SesIdentityError)
  })

  it("reuses an existing identity via GetEmailIdentity", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "CreateEmailIdentityCommand") {
        const err = new Error("exists")
        err.name = "AlreadyExistsException"
        throw err
      }
      if (command.constructor.name === "GetEmailIdentityCommand") {
        return { DkimAttributes: { Tokens: ["x1", "x2", "x3"] } }
      }
      return {}
    })

    const result = await provisionSesDomainIdentity({
      domainName: "example.com",
      region: "us-east-1",
      client: { send },
    })

    expect(result.dkimTokens).toEqual(["x1", "x2", "x3"])
    expect(result.dnsRecords.filter((r) => r.purpose === "dkim")).toHaveLength(
      3
    )
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("throws when SES returns no DKIM tokens", async () => {
    await expect(
      provisionSesDomainIdentity({
        domainName: "example.com",
        region: "us-east-1",
        client: {
          send: async (command) => {
            if (command.constructor.name === "CreateEmailIdentityCommand") {
              return { DkimAttributes: { Tokens: [] } }
            }
            return {}
          },
        },
      })
    ).rejects.toMatchObject({
      name: "SesIdentityError",
      message: expect.stringContaining("DKIM"),
    })
  })
})

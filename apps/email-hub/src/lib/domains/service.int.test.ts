import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { dnsRecord, domain, domainSetupStep } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createUser } from "@workspace/db/test"
import { SesIdentityError } from "@workspace/emails"

import { createDomain, getDomain, updateDomainStatus } from "./service.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("domains service (int)", () => {
  it("stores no rows when SES provisioning fails", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const name = `fail-${suffix}.example.com`
    const user = await createUser(db)

    await expect(
      createDomain(
        name,
        { userId: user.id },
        {
          db,
          sesRegion: "us-east-1",
          provision: async () => {
            throw new SesIdentityError("SES CreateEmailIdentity failed")
          },
        }
      )
    ).rejects.toMatchObject({ code: "unavailable" })

    const rows = await db.select().from(domain).where(eq(domain.name, name))
    expect(rows).toHaveLength(0)
  })

  it("persists DNS records that match SES output and supports detail/patch", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const name = `ok-${suffix}.example.com`
    const user = await createUser(db)

    const tokens = [`a${suffix}`, `b${suffix}`, `c${suffix}`]
    const created = await createDomain(
      name,
      { userId: user.id, requestId: `t049-${suffix}` },
      {
        db,
        sesRegion: "eu-west-1",
        provision: async ({ domainName, region }) => {
          const mailFromDomain = `mail.${domainName}`
          const dnsRecords = [
            ...tokens.map((token) => ({
              purpose: "dkim" as const,
              name: `${token}._domainkey.${domainName}`,
              recordType: "CNAME",
              expectedValue: `${token}.dkim.amazonses.com`,
            })),
            {
              purpose: "spf" as const,
              name: domainName,
              recordType: "TXT",
              expectedValue: "v=spf1 include:amazonses.com ~all",
            },
            {
              purpose: "dmarc" as const,
              name: `_dmarc.${domainName}`,
              recordType: "TXT",
              expectedValue: "v=DMARC1; p=none;",
            },
            {
              purpose: "mx" as const,
              name: mailFromDomain,
              recordType: "MX",
              expectedValue: `10 feedback-smtp.${region}.amazonses.com`,
            },
            {
              purpose: "spf" as const,
              name: mailFromDomain,
              recordType: "TXT",
              expectedValue: "v=spf1 include:amazonses.com ~all",
            },
          ]
          return {
            emailIdentity: domainName,
            identityArn: `arn:aws:ses:${region}:123:identity/${domainName}`,
            mailFromDomain,
            dkimTokens: tokens,
            dnsRecords,
          }
        },
      }
    )

    expect(created.status).toBe("pending")
    expect(created.dns_records).toHaveLength(7)
    expect(
      created.dns_records.filter((row) => row.purpose === "dkim")
    ).toHaveLength(3)

    const dbDns = await db
      .select()
      .from(dnsRecord)
      .where(eq(dnsRecord.domainId, created.id))
    expect(dbDns).toHaveLength(7)
    expect(dbDns.find((row) => row.purpose === "mx")?.expectedValue).toBe(
      `10 feedback-smtp.eu-west-1.amazonses.com`
    )

    const steps = await db
      .select()
      .from(domainSetupStep)
      .where(eq(domainSetupStep.domainId, created.id))
    expect(steps.map((s) => `${s.step}:${s.status}`).sort()).toEqual([
      "dns_records:done",
      "ses_identity:done",
      "verification:pending",
    ])

    const detail = await getDomain(created.id, db)
    expect(detail.dns_records).toHaveLength(7)
    expect(detail.setup_steps).toHaveLength(3)

    const patched = await updateDomainStatus(
      created.id,
      "verifying",
      { userId: user.id },
      db
    )
    expect(patched.status).toBe("verifying")
  })
})

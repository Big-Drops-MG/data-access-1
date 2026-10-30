import {
  AlreadyExistsException,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutEmailIdentityMailFromAttributesCommand,
  SESv2Client,
  type CreateEmailIdentityCommandOutput,
  type GetEmailIdentityCommandOutput,
  type PutEmailIdentityMailFromAttributesCommandOutput,
} from "@aws-sdk/client-sesv2"

type SesIdentityCommand =
  | CreateEmailIdentityCommand
  | GetEmailIdentityCommand
  | PutEmailIdentityMailFromAttributesCommand

type SesIdentityCommandOutput =
  | CreateEmailIdentityCommandOutput
  | GetEmailIdentityCommandOutput
  | PutEmailIdentityMailFromAttributesCommandOutput

export type SesIdentityClient = {
  send(command: SesIdentityCommand): Promise<SesIdentityCommandOutput>
}

export type DnsRecordDraft = {
  purpose: "spf" | "dkim" | "dmarc" | "mx"
  name: string
  recordType: string
  expectedValue: string
}

export type ProvisionedSesIdentity = {
  emailIdentity: string
  identityArn: string | null
  mailFromDomain: string
  dkimTokens: string[]
  dnsRecords: DnsRecordDraft[]
}

export type ProvisionSesIdentityInput = {
  domainName: string
  region: string
  client?: SesIdentityClient
}

export class SesIdentityError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "SesIdentityError"
  }
}

/** Default custom MAIL FROM subdomain (SD#9.1 / SD#11.2). */
export function mailFromDomainFor(domainName: string): string {
  return `mail.${domainName}`
}

/**
 * Build DNS rows from SES Easy DKIM tokens + MAIL FROM subdomain.
 * Values match SES Easy DKIM / custom MAIL FROM documentation.
 */
export function buildDnsRecordsFromSes(input: {
  domainName: string
  region: string
  dkimTokens: string[]
  mailFromDomain: string
}): DnsRecordDraft[] {
  const { domainName, region, dkimTokens, mailFromDomain } = input
  const records: DnsRecordDraft[] = []

  for (const token of dkimTokens) {
    records.push({
      purpose: "dkim",
      name: `${token}._domainkey.${domainName}`,
      recordType: "CNAME",
      expectedValue: `${token}.dkim.amazonses.com`,
    })
  }

  records.push({
    purpose: "spf",
    name: domainName,
    recordType: "TXT",
    expectedValue: "v=spf1 include:amazonses.com ~all",
  })

  records.push({
    purpose: "dmarc",
    name: `_dmarc.${domainName}`,
    recordType: "TXT",
    expectedValue: "v=DMARC1; p=none;",
  })

  records.push({
    purpose: "mx",
    name: mailFromDomain,
    recordType: "MX",
    expectedValue: `10 feedback-smtp.${region}.amazonses.com`,
  })

  records.push({
    purpose: "spf",
    name: mailFromDomain,
    recordType: "TXT",
    expectedValue: "v=spf1 include:amazonses.com ~all",
  })

  return records
}

function defaultClient(region: string): SesIdentityClient {
  const client = new SESv2Client({ region })
  return { send: (command) => client.send(command) }
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof AlreadyExistsException ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "AlreadyExistsException")
  )
}

/**
 * Create SES domain identity with Easy DKIM and custom MAIL FROM (SD#11.2).
 * If the identity already exists, loads DKIM tokens via GetEmailIdentity.
 * Call before persisting domain rows so SES failure leaves no DB rows (T-049).
 */
export async function provisionSesDomainIdentity(
  input: ProvisionSesIdentityInput
): Promise<ProvisionedSesIdentity> {
  const domainName = input.domainName.trim().toLowerCase()
  const region = input.region.trim()
  if (!domainName || !region) {
    throw new SesIdentityError("domainName and region are required")
  }

  const client = input.client ?? defaultClient(region)
  const mailFromDomain = mailFromDomainFor(domainName)

  let dkimTokens: string[]
  try {
    const createOutput = (await client.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: domainName,
      })
    )) as CreateEmailIdentityCommandOutput
    dkimTokens = [...(createOutput.DkimAttributes?.Tokens ?? [])]
  } catch (error) {
    if (!isAlreadyExists(error)) {
      throw new SesIdentityError("SES CreateEmailIdentity failed", {
        cause: error,
      })
    }

    try {
      const existing = (await client.send(
        new GetEmailIdentityCommand({
          EmailIdentity: domainName,
        })
      )) as GetEmailIdentityCommandOutput
      dkimTokens = [...(existing.DkimAttributes?.Tokens ?? [])]
    } catch (getError) {
      throw new SesIdentityError("SES GetEmailIdentity failed", {
        cause: getError,
      })
    }
  }

  try {
    await client.send(
      new PutEmailIdentityMailFromAttributesCommand({
        EmailIdentity: domainName,
        MailFromDomain: mailFromDomain,
        BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
      })
    )
  } catch (error) {
    throw new SesIdentityError(
      "SES PutEmailIdentityMailFromAttributes failed",
      { cause: error }
    )
  }

  if (dkimTokens.length === 0) {
    throw new SesIdentityError("SES identity has no DKIM tokens")
  }

  // SESv2 create response has no IdentityArn; store a stable ARN-shaped reference.
  const identityArn = `arn:aws:ses:${region}:identity/${domainName}`

  return {
    emailIdentity: domainName,
    identityArn,
    mailFromDomain,
    dkimTokens,
    dnsRecords: buildDnsRecordsFromSes({
      domainName,
      region,
      dkimTokens,
      mailFromDomain,
    }),
  }
}

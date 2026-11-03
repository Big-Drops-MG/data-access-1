import {
  AlreadyExistsException,
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  NotFoundException,
  PutEmailIdentityMailFromAttributesCommand,
  SESv2Client,
  type CreateEmailIdentityCommandOutput,
  type DeleteEmailIdentityCommandOutput,
  type GetEmailIdentityCommandOutput,
  type PutEmailIdentityMailFromAttributesCommandOutput,
} from "@aws-sdk/client-sesv2"

type SesIdentityCommand =
  | CreateEmailIdentityCommand
  | DeleteEmailIdentityCommand
  | GetEmailIdentityCommand
  | PutEmailIdentityMailFromAttributesCommand

type SesIdentityCommandOutput =
  | CreateEmailIdentityCommandOutput
  | DeleteEmailIdentityCommandOutput
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
  /** Set only when the user opted into a custom MAIL FROM subdomain. */
  mailFromDomain: string | null
  dkimTokens: string[]
  dnsRecords: DnsRecordDraft[]
}

export type ProvisionSesIdentityInput = {
  domainName: string
  region: string
  mailFromSubdomain?: string
  client?: SesIdentityClient
}

export type DeleteSesIdentityInput = {
  domainName: string
  region: string
  client?: SesIdentityClient
}

export type DeleteSesIdentityResult = {
  /** False when SES returned AccessDenied (dev IAM may lag Terraform). */
  deleted: boolean
  skippedBecauseAccessDenied: boolean
}

export class SesIdentityError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "SesIdentityError"
  }
}

function awsErrorDetail(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.trim()
  }
  return "Unknown AWS error"
}

function isAccessDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "AccessDeniedException"
  )
}

/** Suggested custom MAIL FROM label when the user opts in (SD#9.1 / SD#11.2). */
export const DEFAULT_MAIL_FROM_SUBDOMAIN = "mail"

export function mailFromDomainFor(
  domainName: string,
  subdomain: string
): string {
  return `${subdomain}.${domainName}`
}

/**
 * Build DNS rows from SES Easy DKIM tokens.
 * MAIL FROM MX + SPF are included only when `mailFromDomain` is set.
 */
export function buildDnsRecordsFromSes(input: {
  domainName: string
  region: string
  dkimTokens: string[]
  mailFromDomain?: string | null
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

  if (mailFromDomain) {
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
  }

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

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundException ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "NotFoundException")
  )
}

/**
 * Create SES domain identity with Easy DKIM (SD#11.2).
 * Custom MAIL FROM is set only when `mailFromSubdomain` is provided.
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
  const mailFromSubdomain =
    input.mailFromSubdomain?.trim().toLowerCase() || null
  const mailFromDomain = mailFromSubdomain
    ? mailFromDomainFor(domainName, mailFromSubdomain)
    : null

  let dkimTokens: string[]
  let existingMailFrom: string | undefined
  try {
    const createOutput = (await client.send(
      new CreateEmailIdentityCommand({
        EmailIdentity: domainName,
      })
    )) as CreateEmailIdentityCommandOutput
    dkimTokens = [...(createOutput.DkimAttributes?.Tokens ?? [])]
  } catch (error) {
    if (!isAlreadyExists(error)) {
      throw new SesIdentityError(
        `SES CreateEmailIdentity failed: ${awsErrorDetail(error)}`,
        { cause: error }
      )
    }

    try {
      const existing = (await client.send(
        new GetEmailIdentityCommand({
          EmailIdentity: domainName,
        })
      )) as GetEmailIdentityCommandOutput
      dkimTokens = [...(existing.DkimAttributes?.Tokens ?? [])]
      existingMailFrom =
        existing.MailFromAttributes?.MailFromDomain?.trim().toLowerCase()
    } catch (getError) {
      throw new SesIdentityError(
        `SES GetEmailIdentity failed: ${awsErrorDetail(getError)}`,
        { cause: getError }
      )
    }
  }

  if (mailFromDomain && existingMailFrom !== mailFromDomain) {
    try {
      await client.send(
        new PutEmailIdentityMailFromAttributesCommand({
          EmailIdentity: domainName,
          MailFromDomain: mailFromDomain,
          BehaviorOnMxFailure: "USE_DEFAULT_VALUE",
        })
      )
    } catch (error) {
      const detail = awsErrorDetail(error)
      // Dev IAM may lag Terraform (infra/modules/ses_iam already lists this action).
      // Still return DNS drafts so the domain can be created; fix IAM then re-set MAIL FROM.
      if (!isAccessDenied(error)) {
        throw new SesIdentityError(
          `SES PutEmailIdentityMailFromAttributes failed: ${detail}`,
          { cause: error }
        )
      }
    }
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

/**
 * Remove a domain identity from Amazon SES.
 * Missing identities are treated as already deleted (idempotent).
 * AccessDenied is soft-failed so app-side delete can finish when IAM lags Terraform.
 */
export async function deleteSesDomainIdentity(
  input: DeleteSesIdentityInput
): Promise<DeleteSesIdentityResult> {
  const domainName = input.domainName.trim().toLowerCase()
  const region = input.region.trim()
  if (!domainName || !region) {
    throw new SesIdentityError("domainName and region are required")
  }

  const client = input.client ?? defaultClient(region)
  try {
    await client.send(
      new DeleteEmailIdentityCommand({
        EmailIdentity: domainName,
      })
    )
    return { deleted: true, skippedBecauseAccessDenied: false }
  } catch (error) {
    if (isNotFound(error)) {
      return { deleted: true, skippedBecauseAccessDenied: false }
    }
    if (isAccessDenied(error)) {
      return { deleted: false, skippedBecauseAccessDenied: true }
    }
    throw new SesIdentityError(
      `SES DeleteEmailIdentity failed: ${awsErrorDetail(error)}`,
      { cause: error }
    )
  }
}

import {
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2"

import {
  MailTransportError,
  createMailTransport,
  type SesEmailClient,
} from "../src/mail-transport.js"

const region = process.env.SES_REGION?.trim() ?? ""
const configurationSet = process.env.SES_CONFIGURATION_SET?.trim() ?? ""
const recipient = process.argv[2]?.trim()

if (!region) {
  process.stderr.write("SES_REGION is required.\n")
  process.exit(1)
}
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  process.stderr.write(
    "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required.\n"
  )
  process.exit(1)
}
if (process.argv.length > 3) {
  process.stderr.write("Pass at most one verified email address.\n")
  process.exit(1)
}
if (recipient && !/^[^\s@]+@[^\s@]+$/.test(recipient)) {
  process.stderr.write("The address must be a single email.\n")
  process.exit(1)
}

const aws = new SESv2Client({ region })

try {
  const account = await aws.send(new GetAccountCommand({}))
  process.stdout.write(
    `account sendingEnabled=${String(account.SendingEnabled)} productionAccess=${String(account.ProductionAccessEnabled)} region=${region}\n`
  )

  if (configurationSet) {
    await reportConfigurationSet(aws, configurationSet)
  } else {
    process.stdout.write("configurationSet=unset\n")
  }

  if (!recipient) {
    process.stdout.write("No address passed. No email was sent.\n")
  } else {
    const verified = await identityCanSend(aws, recipient)
    if (!verified) {
      process.stderr.write(
        "Identity is not verified for sending. No email was sent.\n"
      )
      process.exit(1)
    }

    const transport = createMailTransport(
      {
        MAIL_TRANSPORT: "ses",
        SES_REGION: region,
        SES_CONFIGURATION_SET: configurationSet || undefined,
      },
      { sesClient: sesSender(aws) }
    )
    const result = await transport.send({
      from: recipient,
      to: recipient,
      subject: "Email Hub SES transport check",
      html: "<p>SES check from the mail transport adapter.</p>",
      text: "SES check from the mail transport adapter.",
      unsubscribeUrl: "https://example.com/unsubscribe/ses-dev-check",
    })
    process.stdout.write(`sent messageId=${result.providerMessageId}\n`)
  }
} catch (error) {
  if (error instanceof MailTransportError) {
    process.stderr.write(`${error.message}\n`)
  } else {
    process.stderr.write(`${publicError(error)}\n`)
  }
  process.exit(1)
}

async function identityCanSend(
  client: SESv2Client,
  email: string
): Promise<boolean> {
  const domain = email.slice(email.lastIndexOf("@") + 1)
  for (const identity of [email, domain]) {
    try {
      const result = await client.send(
        new GetEmailIdentityCommand({ EmailIdentity: identity })
      )
      if (result.VerifiedForSendingStatus === true) {
        process.stdout.write(`identity=${identity} verified=true\n`)
        return true
      }
    } catch (error) {
      if (!isNotFound(error)) {
        throw error
      }
    }
  }
  return false
}

function sesSender(client: SESv2Client): SesEmailClient {
  return { send: (command) => client.send(command) }
}

async function reportConfigurationSet(
  client: SESv2Client,
  name: string
): Promise<void> {
  try {
    const set = await client.send(
      new GetConfigurationSetCommand({ ConfigurationSetName: name })
    )
    process.stdout.write(
      `configurationSet=${set.ConfigurationSetName ?? name}\n`
    )
  } catch (error) {
    if (
      isNamed(error, "AccessDeniedException") ||
      (error instanceof Error &&
        error.message.includes("ses:GetConfigurationSet"))
    ) {
      process.stdout.write(
        "configurationSet=unconfirmed (ses:GetConfigurationSet is not allowed)\n"
      )
      return
    }
    throw error
  }
}

function isNamed(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name
}

function isNotFound(error: unknown): boolean {
  return isNamed(error, "NotFoundException")
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "SES check failed"
  return message
    .replace(/AKIA[0-9A-Z]{16}/g, "[redacted]")
    .replace(/arn:aws:\S+/g, "[arn]")
}

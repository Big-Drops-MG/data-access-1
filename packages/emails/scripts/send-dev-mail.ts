import {
  MailTransportError,
  createMailTransport,
} from "../src/mail-transport.js"

const forceSes = process.argv[2] === "ses"
const transportName = forceSes ? "ses" : (process.env.MAIL_TRANSPORT ?? "smtp")

if (transportName !== "smtp" && transportName !== "ses") {
  process.stderr.write("MAIL_TRANSPORT must be smtp or ses.\n")
  process.exit(1)
}

const transport = createMailTransport({
  MAIL_TRANSPORT: transportName,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SES_REGION: process.env.SES_REGION,
  SES_CONFIGURATION_SET: process.env.SES_CONFIGURATION_SET,
})

const sesFrom = process.env.SES_FROM_EMAIL?.trim() ?? ""
if (transportName === "ses" && !/^[^@\s<>]+@e\.quotifii\.com$/i.test(sesFrom)) {
  process.stderr.write(
    "SES_FROM_EMAIL must be a mailbox on e.quotifii.com. The Mailpit sender is not used for SES.\n"
  )
  process.exit(1)
}

const message =
  transportName === "ses"
    ? {
        from: sesFrom,
        to: "success@simulator.amazonses.com",
        subject: "Email Hub SES simulator check",
        html: "<p>SES simulator check from the mail transport adapter.</p>",
        text: "SES simulator check from the mail transport adapter.",
        unsubscribeUrl: "https://example.com/unsubscribe/ses-simulator-check",
      }
    : {
        from: "Email Hub <mailpit-test@example.com>",
        to: "test@example.com",
        subject: "Email Hub mail transport check",
        html: "<p>Mailpit SMTP check from the mail transport adapter.</p>",
        text: "Mailpit SMTP check from the mail transport adapter.",
        unsubscribeUrl: "https://example.com/unsubscribe/dev-check",
      }

try {
  const result = await transport.send(message)
  if (transportName === "ses") {
    process.stdout.write("Transport: ses\n")
    process.stdout.write("SES SendEmail succeeded\n")
    process.stdout.write(`MessageId: ${result.providerMessageId}\n`)
  } else {
    process.stdout.write(`sent messageId=${result.providerMessageId}\n`)
  }
} catch (error) {
  const cause =
    error instanceof MailTransportError && error.cause instanceof Error
      ? error.cause.message
      : ""
  const detail =
    error instanceof MailTransportError ? error.message : "send failed"
  const text = cause ? `${detail}: ${cause}` : detail
  process.stderr.write(
    `${text.replace(/AKIA[0-9A-Z]{16}/g, "[redacted]").replace(/arn:aws:\S+/g, "[arn]")}\n`
  )
  process.exit(1)
}

import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2"
import nodemailer from "nodemailer"
import type { SendMailOptions } from "nodemailer"

export const LIST_UNSUBSCRIBE_HEADER = "List-Unsubscribe"
export const LIST_UNSUBSCRIBE_POST_HEADER = "List-Unsubscribe-Post"
export const LIST_UNSUBSCRIBE_POST = "List-Unsubscribe=One-Click"

export type RenderedMessage = {
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  text: string
  unsubscribeUrl?: string
}

export type SendResult = {
  providerMessageId: string
}

export interface MailTransport {
  send(message: RenderedMessage): Promise<SendResult>
}

export class MailTransportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "MailTransportError"
  }
}

export type SesEmailClient = {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>
}

export type SmtpSender = {
  sendMail(options: SendMailOptions): Promise<{ messageId: string }>
}

export type MailTransportSettings = {
  MAIL_TRANSPORT: "smtp" | "ses"
  SMTP_HOST?: string
  SMTP_PORT?: string
  SES_REGION?: string
  SES_CONFIGURATION_SET?: string
}

export type MailTransportOverrides = {
  sesClient?: SesEmailClient
  smtpSender?: SmtpSender
}

export function createMailTransport(
  settings: MailTransportSettings,
  overrides: MailTransportOverrides = {}
): MailTransport {
  if (settings.MAIL_TRANSPORT === "ses") {
    return createSesTransport({
      region: settings.SES_REGION ?? "",
      configurationSet: settings.SES_CONFIGURATION_SET,
      client: overrides.sesClient,
    })
  }

  if (settings.MAIL_TRANSPORT !== "smtp") {
    throw new MailTransportError("MAIL_TRANSPORT must be smtp or ses")
  }

  const host = settings.SMTP_HOST?.trim() ?? ""
  const port = settings.SMTP_PORT?.trim() ?? ""
  if (host === "" || port === "") {
    throw new MailTransportError(
      "SMTP_HOST and SMTP_PORT are required when MAIL_TRANSPORT=smtp"
    )
  }

  return createSmtpTransport({
    host,
    port: parseSmtpPort(settings.SMTP_PORT),
    sender: overrides.smtpSender,
  })
}

export function createSesTransport(options: {
  region: string
  configurationSet?: string
  client?: SesEmailClient
}): MailTransport {
  const region = options.region.trim()
  if (region === "") {
    throw new MailTransportError(
      "SES_REGION is required when MAIL_TRANSPORT=ses"
    )
  }
  const configurationSet = options.configurationSet?.trim() || undefined
  const client = options.client ?? defaultSesClient(region)

  return {
    send: (message) =>
      providerResult("SES", async () => {
        const replyTo = prepareMessage(message)
        const headers = unsubscribeHeaders(message.unsubscribeUrl)
        const output = await client.send(
          new SendEmailCommand({
            FromEmailAddress: message.from,
            Destination: { ToAddresses: [message.to] },
            ...(replyTo ? { ReplyToAddresses: [replyTo] } : {}),
            ...(configurationSet
              ? { ConfigurationSetName: configurationSet }
              : {}),
            Content: {
              Simple: {
                Subject: { Data: message.subject, Charset: "UTF-8" },
                Body: {
                  Html: { Data: message.html, Charset: "UTF-8" },
                  Text: { Data: message.text, Charset: "UTF-8" },
                },
                ...(headers.length > 0 ? { Headers: headers } : {}),
              },
            },
          })
        )
        return output.MessageId ?? ""
      }),
  }
}

export function createSmtpTransport(options: {
  host: string
  port: number
  sender?: SmtpSender
}): MailTransport {
  const host = options.host.trim()
  if (host === "" || !Number.isInteger(options.port) || options.port <= 0) {
    throw new MailTransportError(
      "SMTP_HOST and SMTP_PORT are required when MAIL_TRANSPORT=smtp"
    )
  }
  const sender = options.sender ?? defaultSmtpSender(host, options.port)

  return {
    send: (message) =>
      providerResult("SMTP", async () => {
        const replyTo = prepareMessage(message)
        const headers = smtpUnsubscribeHeaders(message.unsubscribeUrl)
        const info = await sender.sendMail({
          from: message.from,
          to: message.to,
          ...(replyTo ? { replyTo } : {}),
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(headers ? { headers } : {}),
        })
        return info.messageId
      }),
  }
}

function unsubscribeHeaders(
  unsubscribeUrl: string | undefined
): { Name: string; Value: string }[] {
  const url = unsubscribeUrl?.trim() ?? ""
  if (url === "") {
    return []
  }
  const value = url.startsWith("<") ? url : `<${url}>`
  return [
    { Name: LIST_UNSUBSCRIBE_HEADER, Value: value },
    { Name: LIST_UNSUBSCRIBE_POST_HEADER, Value: LIST_UNSUBSCRIBE_POST },
  ]
}

function smtpUnsubscribeHeaders(
  unsubscribeUrl: string | undefined
): Record<string, string> | undefined {
  const headers = unsubscribeHeaders(unsubscribeUrl)
  if (headers.length === 0) {
    return undefined
  }
  return Object.fromEntries(
    headers.map((header) => [header.Name, header.Value])
  )
}

function prepareMessage(message: RenderedMessage): string | undefined {
  if (
    message.from.trim() === "" ||
    message.to.trim() === "" ||
    message.subject.trim() === ""
  ) {
    throw new MailTransportError("from, to, and subject are required")
  }
  if (message.html.trim() === "" || message.text.trim() === "") {
    throw new MailTransportError("html and text bodies are required")
  }
  const replyTo = message.replyTo?.trim()
  return replyTo ? replyTo : undefined
}

async function providerResult(
  label: "SES" | "SMTP",
  send: () => Promise<string>
): Promise<SendResult> {
  try {
    const providerMessageId = (await send()).trim()
    if (providerMessageId === "") {
      throw new MailTransportError(`${label} send did not return a message id`)
    }
    return { providerMessageId }
  } catch (error) {
    if (error instanceof MailTransportError) {
      throw error
    }
    throw new MailTransportError(`${label} send failed`, { cause: error })
  }
}

function parseSmtpPort(value: string | undefined): number {
  const port = value?.trim() ?? ""
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
    throw new MailTransportError("SMTP_PORT must be an integer from 1 to 65535")
  }
  return Number(port)
}

function defaultSesClient(region: string): SesEmailClient {
  const client = new SESv2Client({ region })
  return { send: (command) => client.send(command) }
}

function defaultSmtpSender(host: string, port: number): SmtpSender {
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  })
  return { sendMail: (mail) => transport.sendMail(mail) }
}

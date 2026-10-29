import type { SendEmailCommandInput } from "@aws-sdk/client-sesv2"
import type { SendMailOptions } from "nodemailer"
import { describe, expect, it } from "vitest"

import {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST,
  LIST_UNSUBSCRIBE_POST_HEADER,
  MailTransportError,
  createMailTransport,
  type RenderedMessage,
  type SesEmailClient,
  type SmtpSender,
} from "./mail-transport.js"

const rendered: RenderedMessage = {
  from: "Email Hub <news@example.com>",
  to: "reader@example.com",
  replyTo: "reply@example.com",
  subject: "Your weekly note",
  html: "<p>Hello</p>",
  text: "Hello",
  unsubscribeUrl: "https://example.com/unsubscribe/token",
}

function fakeSes(): {
  client: SesEmailClient
  inputs: SendEmailCommandInput[]
} {
  const inputs: SendEmailCommandInput[] = []
  return {
    inputs,
    client: {
      async send(command) {
        inputs.push(command.input)
        return { MessageId: "ses-message-1", $metadata: {} }
      },
    },
  }
}

function fakeSmtp(): { sender: SmtpSender; sent: SendMailOptions[] } {
  const sent: SendMailOptions[] = []
  return {
    sent,
    sender: {
      async sendMail(options) {
        sent.push(options)
        return { messageId: "<smtp-message-1@mailpit>" }
      },
    },
  }
}

function headerValue(
  headers: { Name?: string; Value?: string }[] | undefined,
  name: string
): string | undefined {
  return headers?.find((header) => header.Name === name)?.Value
}

function smtpHeader(
  options: SendMailOptions | undefined,
  name: string
): string | undefined {
  const headers = options?.headers
  if (!headers || Array.isArray(headers)) {
    return undefined
  }
  const value = Object.entries(headers as Record<string, unknown>).find(
    ([key]) => key === name
  )?.[1]
  return typeof value === "string" ? value : undefined
}

describe("mail transport", () => {
  it("delivers the same rendered message through SES and SMTP", async () => {
    const ses = fakeSes()
    const smtp = fakeSmtp()
    const overrides = { sesClient: ses.client, smtpSender: smtp.sender }

    const sesResult = await createMailTransport(
      {
        MAIL_TRANSPORT: "ses",
        SES_REGION: "us-east-1",
        SES_CONFIGURATION_SET: "emailhub-prod",
      },
      overrides
    ).send(rendered)
    const smtpResult = await createMailTransport(
      {
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
        SES_CONFIGURATION_SET: "ignored-for-smtp",
      },
      overrides
    ).send(rendered)

    const simple = ses.inputs[0]?.Content?.Simple
    expect(sesResult.providerMessageId).toBe("ses-message-1")
    expect(smtpResult.providerMessageId).toBe("<smtp-message-1@mailpit>")
    expect(smtp.sent[0]).toMatchObject({
      from: rendered.from,
      to: rendered.to,
      replyTo: rendered.replyTo,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    })
    expect(ses.inputs[0]?.FromEmailAddress).toBe(smtp.sent[0]?.from)
    expect(ses.inputs[0]?.Destination?.ToAddresses).toEqual([smtp.sent[0]?.to])
    expect(ses.inputs[0]?.ReplyToAddresses).toEqual([smtp.sent[0]?.replyTo])
    expect(simple?.Subject).toEqual({
      Data: rendered.subject,
      Charset: "UTF-8",
    })
    expect(simple?.Body?.Html).toEqual({
      Data: rendered.html,
      Charset: "UTF-8",
    })
    expect(simple?.Body?.Text).toEqual({
      Data: rendered.text,
      Charset: "UTF-8",
    })
    expect(headerValue(simple?.Headers, LIST_UNSUBSCRIBE_HEADER)).toBe(
      `<${rendered.unsubscribeUrl}>`
    )
    expect(smtpHeader(smtp.sent[0], LIST_UNSUBSCRIBE_HEADER)).toBe(
      `<${rendered.unsubscribeUrl}>`
    )
    expect(headerValue(simple?.Headers, LIST_UNSUBSCRIBE_POST_HEADER)).toBe(
      LIST_UNSUBSCRIBE_POST
    )
    expect(smtpHeader(smtp.sent[0], LIST_UNSUBSCRIBE_POST_HEADER)).toBe(
      LIST_UNSUBSCRIBE_POST
    )
    expect(ses.inputs[0]?.ConfigurationSetName).toBe("emailhub-prod")
    expect(ses.inputs).toHaveLength(1)
    expect(smtp.sent).toHaveLength(1)
  })

  it("omits a blank reply-to and SES configuration set", async () => {
    const ses = fakeSes()
    const smtp = fakeSmtp()
    const message: RenderedMessage = {
      ...rendered,
      replyTo: " ",
      unsubscribeUrl: " ",
    }

    await createMailTransport(
      {
        MAIL_TRANSPORT: "ses",
        SES_REGION: "us-east-1",
        SES_CONFIGURATION_SET: " ",
      },
      { sesClient: ses.client }
    ).send(message)
    await createMailTransport(
      { MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025" },
      { smtpSender: smtp.sender }
    ).send(message)

    expect(ses.inputs[0]?.ConfigurationSetName).toBeUndefined()
    expect(ses.inputs[0]?.ReplyToAddresses).toBeUndefined()
    expect(smtp.sent[0]?.replyTo).toBeUndefined()
    expect(
      headerValue(
        ses.inputs[0]?.Content?.Simple?.Headers,
        LIST_UNSUBSCRIBE_HEADER
      )
    ).toBeUndefined()
    expect(smtpHeader(smtp.sent[0], LIST_UNSUBSCRIBE_HEADER)).toBeUndefined()
  })

  it("rejects incomplete settings and messages before a provider is called", async () => {
    const ses = fakeSes()
    const smtp = fakeSmtp()

    expect(() => createMailTransport({ MAIL_TRANSPORT: "ses" })).toThrow(
      /SES_REGION/
    )
    expect(() =>
      createMailTransport({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1" })
    ).toThrow(/SMTP_PORT/)
    expect(() =>
      createMailTransport({
        MAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "70000",
      })
    ).toThrow(/1 to 65535/)
    expect(() =>
      createMailTransport({
        MAIL_TRANSPORT: "sendgrid" as "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "1025",
      })
    ).toThrow(/MAIL_TRANSPORT must be smtp or ses/)

    await expect(
      createMailTransport(
        { MAIL_TRANSPORT: "ses", SES_REGION: "us-east-1" },
        { sesClient: ses.client }
      ).send({ ...rendered, subject: " " })
    ).rejects.toThrow(MailTransportError)
    await expect(
      createMailTransport(
        { MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025" },
        { smtpSender: smtp.sender }
      ).send({ ...rendered, html: " " })
    ).rejects.toThrow(/html and text/)
    expect(ses.inputs).toHaveLength(0)
    expect(smtp.sent).toHaveLength(0)
  })

  it("wraps provider failures and missing message ids", async () => {
    const failingSes: SesEmailClient = {
      async send() {
        throw new Error("throttled")
      },
    }
    const emptySes: SesEmailClient = {
      async send() {
        return { MessageId: " ", $metadata: {} }
      },
    }
    const failingSmtp: SmtpSender = {
      async sendMail() {
        throw new Error("connection refused")
      },
    }

    await expect(
      createMailTransport(
        { MAIL_TRANSPORT: "ses", SES_REGION: "us-east-1" },
        { sesClient: failingSes }
      ).send(rendered)
    ).rejects.toThrow("SES send failed")
    await expect(
      createMailTransport(
        { MAIL_TRANSPORT: "ses", SES_REGION: "us-east-1" },
        { sesClient: emptySes }
      ).send(rendered)
    ).rejects.toThrow("SES send did not return a message id")
    await expect(
      createMailTransport(
        { MAIL_TRANSPORT: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025" },
        { smtpSender: failingSmtp }
      ).send(rendered)
    ).rejects.toThrow("SMTP send failed")
  })
})

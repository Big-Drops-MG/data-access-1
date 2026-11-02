import { describe, expect, it } from "vitest"

import {
  LIST_UNSUBSCRIBE_HEADER,
  LIST_UNSUBSCRIBE_POST,
  LIST_UNSUBSCRIBE_POST_HEADER,
  createSmtpTransport,
  type RenderedMessage,
} from "./mail-transport.js"

const host = process.env.SMTP_HOST ?? "127.0.0.1"
const port = Number(process.env.SMTP_PORT ?? "1025")
const api = `http://${host}:8025`

type MailpitMessage = {
  ID?: string
  Subject?: string
  Text?: string
  HTML?: string
  From?: { Name?: string; Address?: string }
  To?: { Name?: string; Address?: string }[]
  ReplyTo?: { Name?: string; Address?: string }[]
}

async function mailpitIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${api}/api/v1/info`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

const mailpitUp = await mailpitIsUp()
if (process.env.SMTP_HOST && !mailpitUp) {
  throw new Error(`Mailpit is not reachable at ${api}`)
}

function headerValue(
  headers: Record<string, string[]>,
  name: string
): string | undefined {
  return Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  )?.[1]?.[0]
}

async function storedMessage(subject: string): Promise<{
  id: string
  message: MailpitMessage
  headers: Record<string, string[]>
}> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await fetch(
      `${api}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`
    )
    const body = (await search.json()) as {
      messages?: { ID?: string; Subject?: string }[]
    }
    const id = body.messages?.find((item) => item.Subject === subject)?.ID
    if (id) {
      const [messageResponse, headersResponse] = await Promise.all([
        fetch(`${api}/api/v1/message/${id}`),
        fetch(`${api}/api/v1/message/${id}/headers`),
      ])
      return {
        id,
        message: (await messageResponse.json()) as MailpitMessage,
        headers: (await headersResponse.json()) as Record<string, string[]>,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Mailpit did not store the rendered message")
}

describe.skipIf(!mailpitUp)("Mailpit delivery", () => {
  it("stores the same rendered message that SMTP sent", async () => {
    const subject = `T-042 ${crypto.randomUUID()}`
    const rendered: RenderedMessage = {
      from: "Email Hub <news@example.com>",
      to: "reader@example.com",
      replyTo: "reply@example.com",
      subject,
      html: "<p>Hello from the transport</p>",
      text: "Hello from the transport",
      unsubscribeUrl: "https://example.com/unsubscribe/token",
    }
    let id = ""

    try {
      const result = await createSmtpTransport({ host, port }).send(rendered)
      const stored = await storedMessage(subject)
      id = stored.id

      expect(result.providerMessageId.length).toBeGreaterThan(0)
      expect(stored.message.Subject).toBe(rendered.subject)
      expect(stored.message.HTML).toBe(rendered.html)
      expect(stored.message.Text).toBe(rendered.text)
      expect(stored.message.From).toEqual({
        Name: "Email Hub",
        Address: "news@example.com",
      })
      expect(stored.message.To?.[0]?.Address).toBe(rendered.to)
      expect(stored.message.ReplyTo?.[0]?.Address).toBe(rendered.replyTo)
      expect(headerValue(stored.headers, LIST_UNSUBSCRIBE_HEADER)).toBe(
        `<${rendered.unsubscribeUrl}>`
      )
      expect(headerValue(stored.headers, LIST_UNSUBSCRIBE_POST_HEADER)).toBe(
        LIST_UNSUBSCRIBE_POST
      )
    } finally {
      if (id !== "") {
        await fetch(`${api}/api/v1/messages`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: [id] }),
        }).catch(() => undefined)
      }
    }
  })
})

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { createLogger, setFallbackLogger } from "@workspace/logger"

const requireFromLogger = createRequire(
  fileURLToPath(new URL("../../logger/package.json", import.meta.url))
)
const pino = requireFromLogger("pino") as {
  symbols: { streamSym: symbol }
}

type CapturedLogger = ReturnType<typeof createLogger>

import { createSmtpTransport } from "./mail-transport.js"

const RECIPIENT = "alexanderson@example.com"
const FROM = "sender-unique@sender-domain.test"
const UNSUB = "synthetic-unsub-token"

function capture(logger: CapturedLogger): string[] {
  const lines: string[] = []
  const stream = logger[pino.symbols.streamSym] as {
    write: (chunk: string) => void
  }
  const original = stream.write.bind(stream)
  stream.write = (chunk: string) => {
    lines.push(typeof chunk === "string" ? chunk : String(chunk))
    return original(chunk)
  }
  return lines
}

describe("mail transport logging", () => {
  it("masks the recipient in logs and still sends the original address", async () => {
    process.env.LOG_LEVEL = "info"
    process.env.LOG_FORMAT = "json"
    process.env.EMAILHUB_ENV = "dev"
    process.env.NODE_ENV = "test"

    const logger = createLogger({
      service: `emailhub-mail-${crypto.randomUUID()}`,
    })
    setFallbackLogger(logger)
    const lines = capture(logger)
    const sent: Array<string | undefined> = []

    const transport = createSmtpTransport({
      host: "localhost",
      port: 1025,
      sender: {
        sendMail: async (options) => {
          sent.push(typeof options.to === "string" ? options.to : undefined)
          return { messageId: "smtp-message-1" }
        },
      },
    })

    const result = await transport.send({
      from: FROM,
      to: RECIPIENT,
      subject: "Hello",
      html: "<p>synthetic-html-body</p>",
      text: "synthetic-text-body",
      unsubscribeUrl: `https://example.com/unsub?token=${UNSUB}`,
    })

    await new Promise<void>((resolveFlush) => {
      logger.flush(() => {
        resolveFlush()
      })
    })

    expect(result.providerMessageId).toBe("smtp-message-1")
    expect(sent).toEqual([RECIPIENT])

    const text = lines.join("\n")
    expect(text).toContain("a***@example.com")
    expect(text).not.toContain("alexanderson")
    expect(text).not.toContain("sender-domain.test")
    expect(text).not.toContain("synthetic-html-body")
    expect(text).not.toContain("synthetic-text-body")
    expect(text).not.toContain(UNSUB)
    expect(text).toContain("mail.transport.accepted")
  })
})

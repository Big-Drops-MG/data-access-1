import { ImapFlow } from "imapflow"

export type ImapFetchedMessage = {
  uid: number
  raw: Buffer
}

export type ImapMailbox = {
  connect(): Promise<void>
  fetchUnseen(limit: number): Promise<ImapFetchedMessage[]>
  moveToProcessed(uid: number): Promise<void>
  close(): Promise<void>
}

export type ImapMailboxConfig = {
  host: string
  user: string
  password: string
  port?: number
  secure?: boolean
  mailbox?: string
  processedMailbox?: string
  connectionTimeoutMs?: number
}

const DEFAULT_PORT = 993
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAILBOX = "INBOX"
const DEFAULT_PROCESSED = "Processed"

/** Production IMAP client (TLS 993 by default). */
export function createImapFlowMailbox(config: ImapMailboxConfig): ImapMailbox {
  const mailbox = config.mailbox ?? DEFAULT_MAILBOX
  const processed = config.processedMailbox ?? DEFAULT_PROCESSED
  const client = new ImapFlow({
    host: config.host,
    port: config.port ?? DEFAULT_PORT,
    secure: config.secure ?? true,
    auth: { user: config.user, pass: config.password },
    logger: false,
    connectionTimeout: config.connectionTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  })

  return {
    async connect() {
      await client.connect()
      await client.mailboxOpen(mailbox)
      try {
        await client.mailboxCreate(processed)
      } catch {
        // Already exists
      }
    },

    async fetchUnseen(limit: number) {
      const uids = await client.search({ seen: false }, { uid: true })
      if (!uids || uids.length === 0) {
        return []
      }
      const selected = uids.slice(0, limit)
      const out: ImapFetchedMessage[] = []
      for await (const msg of client.fetch(
        selected,
        { uid: true, source: true },
        { uid: true }
      )) {
        if (!msg.source || msg.uid === undefined) {
          continue
        }
        out.push({
          uid: msg.uid,
          raw: Buffer.isBuffer(msg.source)
            ? msg.source
            : Buffer.from(msg.source),
        })
      }
      return out
    },

    async moveToProcessed(uid: number) {
      await client.messageMove(String(uid), processed, { uid: true })
    },

    async close() {
      try {
        await client.logout()
      } catch {
        client.close()
      }
    },
  }
}

/**
 * In-memory IMAP stand-in for unit tests (fake server).
 * Unseen messages live in INBOX; moveToProcessed relocates them.
 */
export class FakeImapServer implements ImapMailbox {
  private inbox: ImapFetchedMessage[] = []
  private processed: ImapFetchedMessage[] = []
  private nextUid = 1
  connected = false

  seedUnseen(raw: string | Buffer): number {
    const uid = this.nextUid++
    this.inbox.push({
      uid,
      raw: Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8"),
    })
    return uid
  }

  inboxUids(): number[] {
    return this.inbox.map((m) => m.uid)
  }

  processedUids(): number[] {
    return this.processed.map((m) => m.uid)
  }

  async connect(): Promise<void> {
    this.connected = true
  }

  async fetchUnseen(limit: number): Promise<ImapFetchedMessage[]> {
    if (!this.connected) {
      throw new Error("FakeImapServer not connected")
    }
    return this.inbox.slice(0, limit).map((m) => ({
      uid: m.uid,
      raw: Buffer.from(m.raw),
    }))
  }

  async moveToProcessed(uid: number): Promise<void> {
    const index = this.inbox.findIndex((m) => m.uid === uid)
    if (index < 0) {
      return
    }
    const [msg] = this.inbox.splice(index, 1)
    if (msg) {
      this.processed.push(msg)
    }
  }

  async close(): Promise<void> {
    this.connected = false
  }
}

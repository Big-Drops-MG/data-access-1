import { beforeEach, describe, expect, it, vi } from "vitest"

const connect = vi.hoisted(() => vi.fn(async () => undefined))
const mailboxOpen = vi.hoisted(() => vi.fn(async () => undefined))
const mailboxCreate = vi.hoisted(() => vi.fn(async () => undefined))
const search = vi.hoisted(() => vi.fn(async () => [] as number[]))
const messageMove = vi.hoisted(() => vi.fn(async () => undefined))
const logout = vi.hoisted(() => vi.fn(async () => undefined))
const close = vi.hoisted(() => vi.fn())
const fetchImpl = vi.hoisted(() =>
  vi.fn(async function* () {
    /* empty */
  })
)

vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(() => ({
    connect,
    mailboxOpen,
    mailboxCreate,
    search,
    fetch: fetchImpl,
    messageMove,
    logout,
    close,
  })),
}))

import { createImapFlowMailbox, FakeImapServer } from "./imap-mailbox.js"

describe("FakeImapServer", () => {
  it("requires connect before fetch and no-ops unknown moves", async () => {
    const server = new FakeImapServer()
    await expect(server.fetchUnseen(1)).rejects.toThrow("not connected")
    await server.connect()
    const uid = server.seedUnseen("hello")
    expect(await server.fetchUnseen(10)).toHaveLength(1)
    await server.moveToProcessed(uid + 99)
    expect(server.inboxUids()).toEqual([uid])
    await server.moveToProcessed(uid)
    expect(server.processedUids()).toEqual([uid])
    await server.close()
    expect(server.connected).toBe(false)
  })
})

describe("createImapFlowMailbox", () => {
  beforeEach(() => {
    connect.mockReset()
    mailboxOpen.mockReset()
    mailboxCreate.mockReset()
    search.mockReset()
    messageMove.mockReset()
    logout.mockReset()
    close.mockReset()
    fetchImpl.mockReset()
    fetchImpl.mockImplementation(async function* () {
      /* empty */
    })
    connect.mockResolvedValue(undefined)
    mailboxOpen.mockResolvedValue(undefined)
    mailboxCreate.mockResolvedValue(undefined)
    search.mockResolvedValue([])
    messageMove.mockResolvedValue(undefined)
    logout.mockResolvedValue(undefined)
  })

  it("connects, opens mailbox, and ignores create-if-exists errors", async () => {
    mailboxCreate.mockRejectedValueOnce(new Error("already exists"))
    const mailbox = createImapFlowMailbox({
      host: "imap.example.com",
      user: "u",
      password: "p",
    })
    await mailbox.connect()
    expect(connect).toHaveBeenCalled()
    expect(mailboxOpen).toHaveBeenCalledWith("INBOX")
    expect(mailboxCreate).toHaveBeenCalledWith("Processed")
  })

  it("returns [] when search finds no unseen mail", async () => {
    search.mockResolvedValueOnce([])
    const mailbox = createImapFlowMailbox({
      host: "imap.example.com",
      user: "u",
      password: "p",
      mailbox: "INBOX",
      processedMailbox: "Done",
    })
    await mailbox.connect()
    await expect(mailbox.fetchUnseen(5)).resolves.toEqual([])
  })

  it("fetches unseen sources and skips incomplete messages", async () => {
    search.mockResolvedValueOnce([1, 2, 3])
    fetchImpl.mockImplementationOnce(async function* () {
      yield { uid: 1, source: Buffer.from("a") }
      yield { uid: 2, source: undefined }
      yield { uid: undefined, source: Buffer.from("b") }
      yield { uid: 3, source: "plain-text" }
    })
    const mailbox = createImapFlowMailbox({
      host: "imap.example.com",
      user: "u",
      password: "p",
      port: 143,
      secure: false,
    })
    await mailbox.connect()
    const messages = await mailbox.fetchUnseen(10)
    expect(messages).toEqual([
      { uid: 1, raw: Buffer.from("a") },
      { uid: 3, raw: Buffer.from("plain-text") },
    ])
  })

  it("moves by uid and falls back to close when logout fails", async () => {
    logout.mockRejectedValueOnce(new Error("gone"))
    const mailbox = createImapFlowMailbox({
      host: "imap.example.com",
      user: "u",
      password: "p",
      processedMailbox: "Archive",
    })
    await mailbox.connect()
    await mailbox.moveToProcessed(42)
    expect(messageMove).toHaveBeenCalledWith("42", "Archive", { uid: true })
    await mailbox.close()
    expect(close).toHaveBeenCalled()
  })
})

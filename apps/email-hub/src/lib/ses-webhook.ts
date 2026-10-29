import {
  createVerify,
  timingSafeEqual,
  X509Certificate,
  type KeyObject,
} from "node:crypto"

import { getPool } from "@workspace/db/client"
import { Redis } from "ioredis"

import {
  applySesNotificationEvent,
  isComplaintEvent,
  isHardBounceEvent,
  type ParsedSesEvent,
} from "@/lib/ses-event-effects"

const MAX_BODY_BYTES = 256 * 1024
const MAX_CERTIFICATE_BYTES = 64 * 1024
const CERTIFICATE_CACHE_LIMIT = 32
const FETCH_TIMEOUT_MS = 5_000

export const SNS_CLAIM_TTL_SECONDS = 60
export const SNS_DEDUPE_TTL_SECONDS = 14 * 24 * 60 * 60

const SNS_HOST = /^sns\.[a-z0-9-]{3,}\.amazonaws\.com(\.cn)?$/
const CERTIFICATE_PATH = /^\/SimpleNotificationService-[A-Za-z0-9-]+\.pem$/
const MESSAGE_ID = /^[A-Za-z0-9-]{1,128}$/
const SES_MESSAGE_ID = /^[A-Za-z0-9@._-]{1,256}$/

const SNS_TYPES = [
  "Notification",
  "SubscriptionConfirmation",
  "UnsubscribeConfirmation",
] as const

type SnsType = (typeof SNS_TYPES)[number]

type SnsEnvelope = {
  Type: SnsType
  MessageId: string
  TopicArn: string
  Message: string
  Timestamp: string
  SignatureVersion: "1" | "2"
  Signature: string
  SigningCertURL: string
  Subject?: string
  SubscribeURL?: string
  Token?: string
}

export type SesMessageStatus =
  "sent" | "delivered" | "bounced" | "complained" | "failed"

const PRIOR_STATUSES: Record<SesMessageStatus, readonly string[]> = {
  sent: ["queued"],
  delivered: ["queued", "sent"],
  bounced: ["queued", "sent", "delivered"],
  complained: ["queued", "sent", "delivered"],
  failed: ["queued", "sent"],
}

const EVENT_STATUS: Record<string, SesMessageStatus | "ignore"> = {
  send: "sent",
  delivery: "delivered",
  bounce: "bounced",
  complaint: "complained",
  reject: "failed",
  renderingfailure: "failed",
  open: "ignore",
  click: "ignore",
  deliverydelay: "ignore",
}

export type SnsClaim = "claimed" | "duplicate" | "pending"

export type SnsDedupe = {
  claim(messageId: string): Promise<SnsClaim>
  complete(messageId: string): Promise<void>
  release(messageId: string): Promise<void>
}

export type SnsRedis = {
  set(
    key: string,
    value: string,
    expiryMode: "EX",
    ttlSeconds: number,
    condition?: "NX"
  ): Promise<"OK" | null>
  get(key: string): Promise<string | null>
  del(key: string): Promise<number>
}

type StatusUpdater = (
  sesMessageId: string,
  status: SesMessageStatus
) => Promise<void>

export type SesEventProcessor = (event: ParsedSesEvent) => Promise<void>

export type SesWebhookDependencies = {
  fetch?: typeof fetch
  certificates?: Map<string, string>
  dedupe?: SnsDedupe
  /**
   * Test override for status-only updates. Production uses
   * {@link processSesEvent} (status + hard-bounce / complaint side effects).
   */
  updateStatus?: StatusUpdater
  processEvent?: SesEventProcessor
  topicArn?: string
}

export class SesWebhookError extends Error {
  readonly kind: "unauthorized" | "unavailable"
  readonly detail: string

  constructor(kind: "unauthorized" | "unavailable", detail: string) {
    super(kind)
    this.name = "SesWebhookError"
    this.kind = kind
    this.detail = detail
  }

  get status(): 401 | 503 {
    return this.kind === "unauthorized" ? 401 : 503
  }
}

const certificateCache = new Map<string, string>()
let redisClient: Promise<Redis> | undefined

export function priorStatuses(status: SesMessageStatus): readonly string[] {
  return PRIOR_STATUSES[status]
}

export function statusForSesEvent(
  eventType: string
): SesMessageStatus | "ignore" | null {
  const key = eventType.toLowerCase().replace(/[\s_-]+/g, "")
  return EVENT_STATUS[key] ?? null
}

export function snsDedupeKey(messageId: string): string {
  return `bd:sns:ses:${messageId}`
}

export function createRedisSnsDedupe(redis: SnsRedis): SnsDedupe {
  return {
    async claim(messageId) {
      const key = snsDedupeKey(messageId)
      try {
        const claimed = await redis.set(
          key,
          "pending",
          "EX",
          SNS_CLAIM_TTL_SECONDS,
          "NX"
        )
        if (claimed === "OK") return "claimed"
        const current = await redis.get(key)
        return current === "done" ? "duplicate" : "pending"
      } catch (error) {
        throw asRedisError(error)
      }
    },
    async complete(messageId) {
      try {
        await redis.set(
          snsDedupeKey(messageId),
          "done",
          "EX",
          SNS_DEDUPE_TTL_SECONDS
        )
      } catch (error) {
        throw asRedisError(error)
      }
    },
    async release(messageId) {
      try {
        await redis.del(snsDedupeKey(messageId))
      } catch (error) {
        throw asRedisError(error)
      }
    },
  }
}

export async function snsDedupeFromEnv(): Promise<SnsDedupe> {
  const client = await sharedRedis()
  return createRedisSnsDedupe({
    async set(key, value, expiryMode, ttlSeconds, condition) {
      const result = await redisCommand(client, () =>
        condition
          ? client.set(key, value, expiryMode, ttlSeconds, condition)
          : client.set(key, value, expiryMode, ttlSeconds)
      )
      return result === "OK" ? "OK" : null
    },
    get: (key) => redisCommand(client, () => client.get(key)),
    del: (key) => redisCommand(client, () => client.del(key)),
  })
}

export async function updateMessageStatus(
  sesMessageId: string,
  status: SesMessageStatus
): Promise<void> {
  try {
    await getPool().query(
      `update message
       set status = $1::message_status, updated_at = now()
       where ses_message_id = $2
         and status::text = any($3::text[])`,
      [status, sesMessageId, [...priorStatuses(status)]]
    )
  } catch (error) {
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unavailable", "postgres")
  }
}

export async function handleSesWebhook(
  input: { contentType: string | null; body: string },
  dependencies: SesWebhookDependencies = {}
): Promise<void> {
  const envelope = parseSnsEnvelope(input.contentType, input.body)
  const fetchImpl = dependencies.fetch ?? fetch
  const pem = await signingCertificate(
    envelope.SigningCertURL,
    fetchImpl,
    dependencies.certificates ?? certificateCache
  )
  assertSignature(envelope, pem)
  assertTopic(envelope.TopicArn, dependencies.topicArn)

  const dedupe = dependencies.dedupe ?? (await snsDedupeFromEnv())
  const claim = await claimMessage(dedupe, envelope.MessageId)
  if (claim === "duplicate") return

  try {
    if (envelope.Type === "SubscriptionConfirmation") {
      await confirmSubscription(
        required(envelope.SubscribeURL, "SubscribeURL"),
        fetchImpl
      )
    } else if (envelope.Type === "Notification") {
      await applyNotification(envelope.Message, dependencies)
    }
  } catch (error) {
    await dedupe.release(envelope.MessageId).catch(() => undefined)
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unavailable", "postgres")
  }

  try {
    await dedupe.complete(envelope.MessageId)
  } catch (error) {
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unavailable", "redis")
  }
}

function asRedisError(error: unknown): SesWebhookError {
  if (error instanceof SesWebhookError) return error
  return new SesWebhookError("unavailable", "redis")
}

function dropRedis(client: Redis): void {
  redisClient = undefined
  client.disconnect()
}

async function redisCommand<T>(
  client: Redis,
  run: () => Promise<T>
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    dropRedis(client)
    throw asRedisError(error)
  }
}

async function sharedRedis(): Promise<Redis> {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) throw new SesWebhookError("unavailable", "redis")
  if (!redisClient) {
    const client = new Redis(redisUrl, {
      connectTimeout: 2_000,
      commandTimeout: 2_000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
      lazyConnect: true,
    })
    client.on("error", () => undefined)
    redisClient = client.connect().then(
      () => client,
      (error: unknown) => {
        redisClient = undefined
        client.disconnect()
        throw error
      }
    )
  }
  try {
    return await redisClient
  } catch (error) {
    throw asRedisError(error)
  }
}

async function claimMessage(
  dedupe: SnsDedupe,
  messageId: string
): Promise<SnsClaim> {
  try {
    const claim = await dedupe.claim(messageId)
    if (claim === "pending") throw new SesWebhookError("unavailable", "redis")
    return claim
  } catch (error) {
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unavailable", "redis")
  }
}

function parseSnsEnvelope(
  contentType: string | null,
  body: string
): SnsEnvelope {
  const mime = contentType?.split(";", 1)[0]?.trim().toLowerCase()
  if (mime !== "text/plain") {
    throw new SesWebhookError("unauthorized", "content-type")
  }
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new SesWebhookError("unauthorized", "body")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new SesWebhookError("unauthorized", "body")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SesWebhookError("unauthorized", "body")
  }

  const record = parsed as Record<string, unknown>
  const type = readString(record, "Type")
  if (!SNS_TYPES.includes(type as SnsType)) {
    throw new SesWebhookError("unauthorized", "Type")
  }
  const messageId = readString(record, "MessageId")
  if (!MESSAGE_ID.test(messageId)) {
    throw new SesWebhookError("unauthorized", "MessageId")
  }
  const signatureVersion = readString(record, "SignatureVersion")
  if (signatureVersion !== "1" && signatureVersion !== "2") {
    throw new SesWebhookError("unauthorized", "SignatureVersion")
  }
  const timestamp = readString(record, "Timestamp")
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new SesWebhookError("unauthorized", "Timestamp")
  }
  const signingCertUrl = readString(record, "SigningCertURL")
  if (!isSnsCertificateUrl(signingCertUrl)) {
    throw new SesWebhookError("unauthorized", "SigningCertURL")
  }

  const envelope: SnsEnvelope = {
    Type: type as SnsType,
    MessageId: messageId,
    TopicArn: readString(record, "TopicArn"),
    Message: readString(record, "Message"),
    Timestamp: timestamp,
    SignatureVersion: signatureVersion,
    Signature: readString(record, "Signature"),
    SigningCertURL: signingCertUrl,
  }
  const subject = readOptionalString(record, "Subject")
  if (subject !== undefined) envelope.Subject = subject

  if (envelope.Type !== "Notification") {
    envelope.Token = readString(record, "Token")
    envelope.SubscribeURL = readString(record, "SubscribeURL")
  }

  return envelope
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== "string" || value.length === 0) {
    throw new SesWebhookError("unauthorized", key)
  }
  return value
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return undefined
  const value = record[key]
  if (typeof value !== "string") {
    throw new SesWebhookError("unauthorized", key)
  }
  return value
}

function required(value: string | undefined, field: string): string {
  if (!value) throw new SesWebhookError("unauthorized", field)
  return value
}

function isSnsHost(hostname: string): boolean {
  return SNS_HOST.test(hostname.toLowerCase())
}

function isSnsCertificateUrl(value: string): boolean {
  if (value.includes("@") || value.includes("\\")) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    isSnsHost(url.hostname) &&
    (url.port === "" || url.port === "443") &&
    url.username === "" &&
    url.password === "" &&
    url.search === "" &&
    url.hash === "" &&
    CERTIFICATE_PATH.test(url.pathname)
  )
}

function isConfirmSubscriptionUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === "https:" &&
    isSnsHost(url.hostname) &&
    (url.port === "" || url.port === "443") &&
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.searchParams.get("Action") === "ConfirmSubscription" &&
    url.hash === ""
  )
}

function stringToSign(envelope: SnsEnvelope): string {
  const fields =
    envelope.Type === "Notification"
      ? envelope.Subject === undefined
        ? ["Message", "MessageId", "Timestamp", "TopicArn", "Type"]
        : ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ]
  return fields
    .map((field) => `${field}\n${envelope[field as keyof SnsEnvelope] ?? ""}\n`)
    .join("")
}

function assertSignature(envelope: SnsEnvelope, pem: string): void {
  const publicKey = certificatePublicKey(pem)
  const algorithm =
    envelope.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1"
  try {
    const verifier = createVerify(algorithm)
    verifier.update(stringToSign(envelope), "utf8")
    if (!verifier.verify(publicKey, envelope.Signature, "base64")) {
      throw new SesWebhookError("unauthorized", "Signature")
    }
  } catch (error) {
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unauthorized", "Signature")
  }
}

function certificatePublicKey(pem: string): KeyObject {
  try {
    const certificate = new X509Certificate(pem)
    const from = Date.parse(certificate.validFrom)
    const to = Date.parse(certificate.validTo)
    const now = Date.now()
    if (Number.isNaN(from) || Number.isNaN(to) || now < from || now > to) {
      throw new SesWebhookError("unauthorized", "SigningCertURL")
    }
    return certificate.publicKey
  } catch (error) {
    if (error instanceof SesWebhookError) throw error
    throw new SesWebhookError("unauthorized", "SigningCertURL")
  }
}

function assertTopic(actual: string, override?: string): void {
  const expected = (override ?? process.env.SNS_TOPIC_ARN)?.trim() ?? ""
  if (!expected) throw new SesWebhookError("unavailable", "config")
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new SesWebhookError("unauthorized", "TopicArn")
  }
}

async function signingCertificate(
  url: string,
  fetchImpl: typeof fetch,
  certificates: Map<string, string>
): Promise<string> {
  const cached = certificates.get(url)
  if (cached) return cached

  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new SesWebhookError("unavailable", "sns")
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new SesWebhookError("unauthorized", "SigningCertURL")
  }
  const pem = await response.text()
  if (
    pem.length > MAX_CERTIFICATE_BYTES ||
    !pem.includes("BEGIN CERTIFICATE")
  ) {
    throw new SesWebhookError("unauthorized", "SigningCertURL")
  }
  certificates.delete(url)
  certificates.set(url, pem)
  while (certificates.size > CERTIFICATE_CACHE_LIMIT) {
    const oldest = certificates.keys().next().value
    if (oldest === undefined) break
    certificates.delete(oldest)
  }
  return pem
}

async function confirmSubscription(
  subscribeUrl: string,
  fetchImpl: typeof fetch
): Promise<void> {
  if (!isConfirmSubscriptionUrl(subscribeUrl)) {
    throw new SesWebhookError("unauthorized", "SubscribeURL")
  }
  let response: Response
  try {
    response = await fetchImpl(subscribeUrl, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new SesWebhookError("unavailable", "sns")
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new SesWebhookError("unavailable", "sns")
  }
  await response.body?.cancel().catch(() => undefined)
}

async function applyNotification(
  message: string,
  dependencies: SesWebhookDependencies
): Promise<void> {
  const event = readSesEvent(message)
  if (!event) return
  const status = statusForSesEvent(event.eventType)
  if (status === null || status === "ignore") return

  if (dependencies.processEvent) {
    await dependencies.processEvent(event)
    return
  }

  if (dependencies.updateStatus) {
    await dependencies.updateStatus(event.sesMessageId, status)
    return
  }

  // Hard bounce / complaint: status + side effects in one transaction (SD#7 Stage C).
  if (isHardBounceEvent(event) || isComplaintEvent(event)) {
    try {
      await applySesNotificationEvent(event, status)
    } catch (error) {
      if (error instanceof SesWebhookError) throw error
      throw new SesWebhookError("unavailable", "postgres")
    }
    return
  }

  await updateMessageStatus(event.sesMessageId, status)
}

export function readSesEvent(message: string): ParsedSesEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(message)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null
  const record = parsed as Record<string, unknown>
  const eventType = record.eventType ?? record.notificationType
  if (typeof eventType !== "string" || eventType.length === 0) return null
  const mail = record.mail
  if (!mail || typeof mail !== "object" || Array.isArray(mail)) return null
  const sesMessageId = (mail as Record<string, unknown>).messageId
  if (typeof sesMessageId !== "string" || !SES_MESSAGE_ID.test(sesMessageId)) {
    return null
  }
  return {
    eventType,
    sesMessageId,
    bounceType: readBounceType(record),
    recipientEmails: readRecipientEmails(record),
  }
}

function readBounceType(record: Record<string, unknown>): string | null {
  const bounce = record.bounce
  if (!bounce || typeof bounce !== "object" || Array.isArray(bounce)) {
    return null
  }
  const bounceType = (bounce as Record<string, unknown>).bounceType
  return typeof bounceType === "string" && bounceType.length > 0
    ? bounceType
    : null
}

function readRecipientEmails(record: Record<string, unknown>): string[] {
  const fromLists = [
    ...emailsFromRecipientList(
      nestedRecord(record, "bounce"),
      "bouncedRecipients"
    ),
    ...emailsFromRecipientList(
      nestedRecord(record, "complaint"),
      "complainedRecipients"
    ),
  ]
  if (fromLists.length > 0) {
    return uniqueEmails(fromLists)
  }

  const mail = nestedRecord(record, "mail")
  const destination = mail?.destination
  if (!Array.isArray(destination)) {
    return []
  }
  return uniqueEmails(
    destination.filter((value): value is string => typeof value === "string")
  )
}

function nestedRecord(
  record: Record<string, unknown>,
  key: string
): Record<string, unknown> | null {
  const value = record[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function emailsFromRecipientList(
  parent: Record<string, unknown> | null,
  key: string
): string[] {
  if (!parent) {
    return []
  }
  const list = parent[key]
  if (!Array.isArray(list)) {
    return []
  }
  const emails: string[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue
    }
    const email = (entry as Record<string, unknown>).emailAddress
    if (typeof email === "string" && email.trim().length > 0) {
      emails.push(email)
    }
  }
  return emails
}

function uniqueEmails(emails: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of emails) {
    const key = email.trim().toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(email.trim())
  }
  return out
}

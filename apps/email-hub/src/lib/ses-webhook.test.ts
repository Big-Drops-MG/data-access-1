import {
  createPublicKey,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto"

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  createRedisSnsDedupe,
  handleSesWebhook,
  priorStatuses,
  SesWebhookError,
  SNS_CLAIM_TTL_SECONDS,
  SNS_DEDUPE_TTL_SECONDS,
  snsDedupeFromEnv,
  snsDedupeKey,
  statusForSesEvent,
  updateMessageStatus,
  type SnsRedis,
} from "./ses-webhook.js"

const query = vi.hoisted(() => vi.fn())

const redisMock = vi.hoisted(() => {
  const state = {
    constructed: 0,
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    set: vi.fn(async (): Promise<"OK" | null> => "OK"),
    get: vi.fn(async (): Promise<string | null> => null),
    del: vi.fn(async () => 1),
    on: vi.fn(),
    options: undefined as { retryStrategy?: () => unknown } | undefined,
  }

  class Redis {
    connect = state.connect
    disconnect = state.disconnect
    set = state.set
    get = state.get
    del = state.del
    on = state.on

    constructor(_url: string, options: { retryStrategy?: () => unknown }) {
      state.constructed += 1
      state.options = options
    }
  }

  return { state, Redis }
})

vi.mock("@workspace/db/client", () => ({
  getPool: () => ({ query }),
}))

vi.mock("ioredis", () => ({
  Redis: redisMock.Redis,
}))

const TOPIC = "arn:aws:sns:us-east-1:123456789012:emailhub-ses-events"
const CERT_URL =
  "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem"
const SNS_MESSAGE_ID = "4f3a6d5c-1b2e-4a9f-8c7d-6e5f4a3b2c1d"
const SES_ID = "0100018f8c8e8e8e-aaaa-bbbb-cccc-ddddeeeeffff-000000"

let privateKey: KeyObject
let certificatePem: string

beforeAll(() => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 })
  privateKey = pair.privateKey
  certificatePem = selfSignedCertificate(
    pair.privateKey,
    daysFromNow(-1),
    daysFromNow(365)
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  query.mockReset()
  query.mockResolvedValue({ rowCount: 1 })
  redisMock.state.constructed = 0
  redisMock.state.options = undefined
  redisMock.state.connect.mockReset()
  redisMock.state.connect.mockResolvedValue(undefined)
  redisMock.state.disconnect.mockReset()
  redisMock.state.set.mockReset()
  redisMock.state.set.mockResolvedValue("OK")
  redisMock.state.get.mockReset()
  redisMock.state.get.mockResolvedValue(null)
  redisMock.state.del.mockReset()
  redisMock.state.on.mockReset()
})

describe("SES event mapping", () => {
  it("maps SES event types onto forward-only message statuses", () => {
    expect(statusForSesEvent("Send")).toBe("sent")
    expect(statusForSesEvent("Delivery")).toBe("delivered")
    expect(statusForSesEvent("Bounce")).toBe("bounced")
    expect(statusForSesEvent("Complaint")).toBe("complained")
    expect(statusForSesEvent("Reject")).toBe("failed")
    expect(statusForSesEvent("Rendering Failure")).toBe("failed")
    expect(statusForSesEvent("Open")).toBe("ignore")
    expect(statusForSesEvent("Click")).toBe("ignore")
    expect(statusForSesEvent("DeliveryDelay")).toBe("ignore")
    expect(statusForSesEvent("Unknown")).toBeNull()
  })

  it("never moves a message backward or off a terminal status", () => {
    expect(priorStatuses("sent")).toEqual(["queued"])
    expect(priorStatuses("delivered")).toEqual(["queued", "sent"])
    expect(priorStatuses("bounced")).toEqual(["queued", "sent", "delivered"])
    expect(priorStatuses("complained")).toEqual(["queued", "sent", "delivered"])
    expect(priorStatuses("failed")).toEqual(["queued", "sent"])
    for (const status of [
      "sent",
      "delivered",
      "bounced",
      "complained",
      "failed",
    ] as const) {
      expect(priorStatuses(status)).not.toContain(status)
      expect(priorStatuses(status)).not.toContain("skipped")
    }
  })
})

describe("updateMessageStatus", () => {
  it("updates only from the prior statuses for that outcome", async () => {
    await updateMessageStatus(SES_ID, "bounced")

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("$1::message_status"),
      ["bounced", SES_ID, ["queued", "sent", "delivered"]]
    )
  })

  it("rethrows a webhook error from the database", async () => {
    query.mockRejectedValue(new SesWebhookError("unavailable", "postgres"))

    await expect(updateMessageStatus(SES_ID, "sent")).rejects.toBeInstanceOf(
      SesWebhookError
    )
  })

  it("reports postgres unavailable when the update fails", async () => {
    query.mockRejectedValue(new Error("connection refused"))

    await expect(updateMessageStatus(SES_ID, "sent")).rejects.toMatchObject({
      kind: "unavailable",
      detail: "postgres",
      status: 503,
    })
  })
})

describe("SNS message dedupe", () => {
  it("claims a message id once, then treats a finished id as a duplicate", async () => {
    const redis = fakeRedis()
    const dedupe = createRedisSnsDedupe(redis)

    await expect(dedupe.claim(SNS_MESSAGE_ID)).resolves.toBe("claimed")
    expect(redis.set).toHaveBeenCalledWith(
      snsDedupeKey(SNS_MESSAGE_ID),
      "pending",
      "EX",
      SNS_CLAIM_TTL_SECONDS,
      "NX"
    )

    redis.values.set(snsDedupeKey(SNS_MESSAGE_ID), "done")
    await expect(dedupe.claim(SNS_MESSAGE_ID)).resolves.toBe("duplicate")
  })

  it("reports an in-progress id and redis failures", async () => {
    const redis = fakeRedis()
    redis.values.set(snsDedupeKey(SNS_MESSAGE_ID), "pending")
    const dedupe = createRedisSnsDedupe(redis)

    await expect(dedupe.claim(SNS_MESSAGE_ID)).resolves.toBe("pending")

    redis.set.mockRejectedValueOnce(new Error("down"))
    await expect(dedupe.claim("other-id")).rejects.toMatchObject({
      detail: "redis",
      status: 503,
    })
  })

  it("stores a finished id for the retry window and releases a failed claim", async () => {
    const redis = fakeRedis()
    const dedupe = createRedisSnsDedupe(redis)

    await dedupe.complete(SNS_MESSAGE_ID)
    expect(redis.set).toHaveBeenCalledWith(
      snsDedupeKey(SNS_MESSAGE_ID),
      "done",
      "EX",
      SNS_DEDUPE_TTL_SECONDS
    )

    await dedupe.release(SNS_MESSAGE_ID)
    expect(redis.del).toHaveBeenCalledWith(snsDedupeKey(SNS_MESSAGE_ID))
  })

  it("reports redis unavailable when REDIS_URL is missing", async () => {
    vi.stubEnv("REDIS_URL", "")

    await expect(snsDedupeFromEnv()).rejects.toMatchObject({
      kind: "unavailable",
      detail: "redis",
    })
    expect(redisMock.state.constructed).toBe(0)
  })

  it("reports redis unavailable when a finished write or release fails", async () => {
    const redis = fakeRedis()
    const dedupe = createRedisSnsDedupe(redis)
    redis.set.mockRejectedValueOnce(new Error("down"))
    await expect(dedupe.complete(SNS_MESSAGE_ID)).rejects.toMatchObject({
      detail: "redis",
    })

    redis.del.mockRejectedValueOnce(new SesWebhookError("unavailable", "redis"))
    await expect(dedupe.release(SNS_MESSAGE_ID)).rejects.toMatchObject({
      detail: "redis",
    })
  })

  it("connects from REDIS_URL, retries a failed connect, and reuses the client", async () => {
    vi.stubEnv("REDIS_URL", "redis://:emailhub@127.0.0.1:6379")
    redisMock.state.connect.mockRejectedValueOnce(new Error("down"))

    await expect(snsDedupeFromEnv()).rejects.toMatchObject({ detail: "redis" })
    expect(redisMock.state.disconnect).toHaveBeenCalledOnce()

    const dedupe = await snsDedupeFromEnv()
    await expect(dedupe.claim("abc-123")).resolves.toBe("claimed")
    redisMock.state.set.mockResolvedValueOnce(null)
    await expect(dedupe.claim("def-456")).resolves.toBe("pending")
    await dedupe.complete("abc-123")
    await snsDedupeFromEnv()

    expect(redisMock.state.constructed).toBe(2)
    expect(redisMock.state.options?.retryStrategy?.()).toBeNull()
    const errorHandler = redisMock.state.on.mock.calls.find(
      (call) => call[0] === "error"
    )?.[1] as ((error: unknown) => void) | undefined
    errorHandler?.(new Error("socket"))

    redisMock.state.set.mockRejectedValueOnce(new Error("closed"))
    await expect(dedupe.claim("ghi-789")).rejects.toMatchObject({
      detail: "redis",
    })
    await snsDedupeFromEnv()

    expect(redisMock.state.constructed).toBe(3)
    expect(redisMock.state.disconnect).toHaveBeenCalledTimes(2)
    expect(redisMock.state.set).toHaveBeenCalledWith(
      snsDedupeKey("abc-123"),
      "done",
      "EX",
      SNS_DEDUPE_TTL_SECONDS
    )
  })
})

describe("handleSesWebhook", () => {
  it("rejects anything that is not a text/plain SNS document", async () => {
    const harness = createHarness()

    await expect(
      handleSesWebhook(
        { contentType: "application/json", body: "{}" },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "content-type", status: 401 })
    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body: "not-json" },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "body", status: 401 })
    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body: "a".repeat(256 * 1024 + 1) },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "body", status: 401 })
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it("rejects certificate urls that are not an SNS pem", async () => {
    const harness = createHarness()
    const urls = [
      "http://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
      "https://example.com/SimpleNotificationService-test.pem",
      "https://sns.us-east-1.amazonaws.com.evil.com/SimpleNotificationService-test.pem",
      "https://user:pass@sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
      "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem?x=1",
    ]

    for (const signingCertUrl of urls) {
      const body = signRecord({
        ...baseNotification(),
        SigningCertURL: signingCertUrl,
      })
      await expect(
        handleSesWebhook(
          { contentType: "text/plain", body },
          harness.dependencies
        )
      ).rejects.toMatchObject({ detail: "SigningCertURL", status: 401 })
    }
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it("rejects a forged signature", async () => {
    const harness = createHarness()
    const signed = JSON.parse(signRecord(baseNotification())) as Record<
      string,
      string
    >
    signed.Message = sesEvent("Bounce")

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body: JSON.stringify(signed) },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "Signature", status: 401 })
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("rejects an expired signing certificate", async () => {
    const harness = createHarness(
      selfSignedCertificate(privateKey, daysFromNow(-10), daysFromNow(-1))
    )

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification()),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "SigningCertURL", status: 401 })
  })

  it("rejects a notification for a different topic", async () => {
    const harness = createHarness()
    const body = signRecord({
      ...baseNotification(),
      TopicArn: "arn:aws:sns:us-east-1:123456789012:other",
    })

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "TopicArn", status: 401 })
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("returns unavailable when the topic is not configured", async () => {
    vi.stubEnv("SNS_TOPIC_ARN", "")
    const harness = createHarness()
    const { topicArn: _topicArn, ...dependencies } = harness.dependencies

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body: signRecord(baseNotification()) },
        dependencies
      )
    ).rejects.toMatchObject({ detail: "config", status: 503 })
  })

  it("confirms a subscription against the SNS subscribe url", async () => {
    const harness = createHarness()
    const subscribeUrl =
      "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc"
    const body = signRecord({
      Type: "SubscriptionConfirmation",
      MessageId: SNS_MESSAGE_ID,
      TopicArn: TOPIC,
      Message: "confirm me",
      SubscribeURL: subscribeUrl,
      Timestamp: "2026-10-23T12:00:00.000Z",
      Token: "abc",
      SignatureVersion: "2",
      SigningCertURL: CERT_URL,
    })

    await handleSesWebhook(
      { contentType: "text/plain", body },
      harness.dependencies
    )

    expect(harness.fetchImpl).toHaveBeenCalledWith(
      subscribeUrl,
      expect.objectContaining({ method: "GET", redirect: "error" })
    )
    expect(harness.updateStatus).not.toHaveBeenCalled()
    expect(harness.store.get(snsDedupeKey(SNS_MESSAGE_ID))).toBe("done")
  })

  it("does not confirm a subscribe url outside SNS", async () => {
    const harness = createHarness()
    const body = signRecord({
      Type: "SubscriptionConfirmation",
      MessageId: SNS_MESSAGE_ID,
      TopicArn: TOPIC,
      Message: "confirm me",
      SubscribeURL: "https://example.com/?Action=ConfirmSubscription",
      Timestamp: "2026-10-23T12:00:00.000Z",
      Token: "abc",
      SignatureVersion: "2",
      SigningCertURL: CERT_URL,
    })

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "SubscribeURL", status: 401 })
    expect(harness.fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(harness.fetchImpl.mock.calls[0]?.[0])).toBe(CERT_URL)
  })

  it("releases the claim when subscription confirmation fails", async () => {
    const harness = createHarness()
    harness.fetchImpl.mockImplementation(
      async (input: string | URL | Request) => {
        const url = String(input)
        if (url === CERT_URL)
          return new Response(certificatePem, { status: 200 })
        return new Response("no", { status: 500 })
      }
    )
    const body = signRecord({
      Type: "SubscriptionConfirmation",
      MessageId: SNS_MESSAGE_ID,
      TopicArn: TOPIC,
      Message: "confirm me",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc",
      Timestamp: "2026-10-23T12:00:00.000Z",
      Token: "abc",
      SignatureVersion: "2",
      SigningCertURL: CERT_URL,
    })

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "sns", status: 503 })
    expect(harness.store.has(snsDedupeKey(SNS_MESSAGE_ID))).toBe(false)

    harness.fetchImpl.mockImplementation(
      async (input: string | URL | Request) => {
        if (String(input) === CERT_URL) {
          return new Response(certificatePem, { status: 200 })
        }
        throw new Error("network")
      }
    )
    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "sns", status: 503 })
  })

  it("acknowledges an unsubscribe confirmation without calling AWS", async () => {
    const harness = createHarness()
    const body = signRecord({
      Type: "UnsubscribeConfirmation",
      MessageId: SNS_MESSAGE_ID,
      TopicArn: TOPIC,
      Message: "unsubscribe",
      SubscribeURL:
        "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc",
      Timestamp: "2026-10-23T12:00:00.000Z",
      Token: "abc",
      SignatureVersion: "2",
      SigningCertURL: CERT_URL,
    })

    await handleSesWebhook(
      { contentType: "text/plain", body },
      harness.dependencies
    )

    expect(harness.fetchImpl).toHaveBeenCalledTimes(1)
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("verifies signature version 1 and a subject", async () => {
    const harness = createHarness()
    const body = signRecord(
      {
        ...baseNotification(sesEvent("Send")),
        Subject: "Amazon SES Email Event",
      },
      "RSA-SHA1",
      "1"
    )

    await handleSesWebhook(
      { contentType: "text/plain", body },
      harness.dependencies
    )

    expect(harness.updateStatus).toHaveBeenCalledWith(SES_ID, "sent")
  })

  it("moves delivery, bounce, complaint, and failure forward", async () => {
    const cases = [
      ["Delivery", "delivered"],
      ["Bounce", "bounced"],
      ["Complaint", "complained"],
      ["Reject", "failed"],
      ["Rendering Failure", "failed"],
    ] as const

    for (const [eventType, status] of cases) {
      const harness = createHarness()
      await handleSesWebhook(
        {
          contentType: "text/plain; charset=UTF-8",
          body: signRecord(baseNotification(sesEvent(eventType))),
        },
        harness.dependencies
      )
      expect(harness.updateStatus).toHaveBeenCalledWith(SES_ID, status)
    }
  })

  it("accepts the classic notificationType field", async () => {
    const harness = createHarness()
    const body = signRecord(
      baseNotification(
        JSON.stringify({
          notificationType: "Bounce",
          mail: { messageId: SES_ID },
        })
      )
    )

    await handleSesWebhook(
      { contentType: "text/plain", body },
      harness.dependencies
    )

    expect(harness.updateStatus).toHaveBeenCalledWith(SES_ID, "bounced")
  })

  it("passes Permanent bounceType through processEvent for hard-bounce handling", async () => {
    const harness = createHarness()
    const processEvent = vi.fn(async () => undefined)
    const body = signRecord(
      baseNotification(
        JSON.stringify({
          eventType: "Bounce",
          bounce: { bounceType: "Permanent", bounceSubType: "General" },
          mail: { messageId: SES_ID },
        })
      )
    )

    await handleSesWebhook(
      { contentType: "text/plain", body },
      { ...harness.dependencies, processEvent }
    )

    expect(processEvent).toHaveBeenCalledWith({
      eventType: "Bounce",
      sesMessageId: SES_ID,
      bounceType: "Permanent",
      recipientEmails: [],
    })
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("extracts bounced recipient emails for orphan hard-bounce lookup", async () => {
    const harness = createHarness()
    const processEvent = vi.fn(async () => undefined)
    const body = signRecord(
      baseNotification(
        JSON.stringify({
          eventType: "Bounce",
          bounce: {
            bounceType: "Permanent",
            bouncedRecipients: [{ emailAddress: "Ada@Example.com" }],
          },
          mail: { messageId: SES_ID, destination: ["Ada@Example.com"] },
        })
      )
    )

    await handleSesWebhook(
      { contentType: "text/plain", body },
      { ...harness.dependencies, processEvent }
    )

    expect(processEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        bounceType: "Permanent",
        recipientEmails: ["Ada@Example.com"],
      })
    )
  })

  it("acknowledges open, click, delay, and unknown events without a status change", async () => {
    for (const eventType of [
      "Open",
      "Click",
      "DeliveryDelay",
      "Subscription",
    ]) {
      const harness = createHarness()
      await handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent(eventType))),
        },
        harness.dependencies
      )
      expect(harness.updateStatus).not.toHaveBeenCalled()
      expect(harness.store.get(snsDedupeKey(SNS_MESSAGE_ID))).toBe("done")
    }
  })

  it("acknowledges a notification that is not an SES event", async () => {
    const harness = createHarness()

    await handleSesWebhook(
      {
        contentType: "text/plain",
        body: signRecord(baseNotification("not-json")),
      },
      harness.dependencies
    )

    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("does not apply a duplicate SNS message", async () => {
    const harness = createHarness()
    const body = signRecord(baseNotification(sesEvent("Delivery")))
    const input = { contentType: "text/plain", body }

    await handleSesWebhook(input, harness.dependencies)
    await handleSesWebhook(input, harness.dependencies)

    expect(harness.updateStatus).toHaveBeenCalledTimes(1)
  })

  it("asks SNS to retry when the same message is still in progress", async () => {
    const harness = createHarness()
    harness.store.set(snsDedupeKey(SNS_MESSAGE_ID), "pending")

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent("Delivery"))),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "redis", status: 503 })
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("releases the claim when the status update fails", async () => {
    const harness = createHarness()
    harness.updateStatus.mockRejectedValue(new Error("db down"))

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent("Delivery"))),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "postgres", status: 503 })
    expect(harness.store.has(snsDedupeKey(SNS_MESSAGE_ID))).toBe(false)
  })

  it("returns unavailable when redis cannot record the claim", async () => {
    const harness = createHarness()
    harness.dependencies.dedupe = {
      claim: () => Promise.reject(new Error("redis down")),
      complete: () => Promise.resolve(),
      release: () => Promise.resolve(),
    }

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent("Delivery"))),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "redis", status: 503 })
    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("fetches each signing certificate once", async () => {
    const harness = createHarness()
    const { certificates: _certificates, ...dependencies } =
      harness.dependencies
    const first = signRecord({
      ...baseNotification(sesEvent("Delivery")),
      MessageId: "11111111-1111-1111-1111-111111111111",
    })
    const second = signRecord({
      ...baseNotification(sesEvent("Bounce")),
      MessageId: "22222222-2222-2222-2222-222222222222",
    })

    await handleSesWebhook(
      { contentType: "text/plain", body: first },
      dependencies
    )
    await handleSesWebhook(
      { contentType: "text/plain", body: second },
      dependencies
    )

    expect(harness.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("rejects malformed SNS documents before fetching a certificate", async () => {
    const harness = createHarness()
    const cases: Array<[string, string | null, string]> = [
      ["null", "text/plain", "body"],
      ["[]", "text/plain", "body"],
      [JSON.stringify({ Type: "Ping" }), "text/plain", "Type"],
      [
        JSON.stringify({ Type: "Notification", MessageId: "bad id" }),
        "text/plain",
        "MessageId",
      ],
      [
        JSON.stringify({
          Type: "Notification",
          MessageId: SNS_MESSAGE_ID,
          SignatureVersion: "9",
        }),
        "text/plain",
        "SignatureVersion",
      ],
      [
        JSON.stringify({
          Type: "Notification",
          MessageId: SNS_MESSAGE_ID,
          SignatureVersion: "2",
          Timestamp: "yesterday",
        }),
        "text/plain",
        "Timestamp",
      ],
      [
        JSON.stringify({
          ...baseNotification(),
          Subject: null,
          Signature: "abc",
        }),
        "text/plain",
        "Subject",
      ],
      ["{}", null, "content-type"],
    ]

    for (const [body, contentType, detail] of cases) {
      await expect(
        handleSesWebhook({ contentType, body }, harness.dependencies)
      ).rejects.toMatchObject({ detail, status: 401 })
    }
    expect(harness.fetchImpl).not.toHaveBeenCalled()
  })

  it("rejects a certificate that cannot be fetched or parsed", async () => {
    const harness = createHarness()
    const body = signRecord(baseNotification())
    const input = { contentType: "text/plain", body }

    harness.fetchImpl.mockRejectedValueOnce(new Error("network"))
    await expect(
      handleSesWebhook(input, harness.dependencies)
    ).rejects.toMatchObject({ detail: "sns", status: 503 })

    harness.fetchImpl.mockResolvedValueOnce(
      new Response("missing", { status: 404 })
    )
    await expect(
      handleSesWebhook(input, harness.dependencies)
    ).rejects.toMatchObject({ detail: "SigningCertURL", status: 401 })

    harness.fetchImpl.mockResolvedValueOnce(
      new Response("not-a-cert", { status: 200 })
    )
    await expect(
      handleSesWebhook(input, harness.dependencies)
    ).rejects.toMatchObject({ detail: "SigningCertURL", status: 401 })
  })

  it("releases the claim when the subscribe url is not an SNS confirmation", async () => {
    const harness = createHarness()
    harness.fetchImpl.mockImplementation(
      async (input: string | URL | Request) => {
        if (String(input) === CERT_URL) {
          return new Response(certificatePem, { status: 200 })
        }
        throw new Error("network")
      }
    )
    const body = signRecord({
      Type: "SubscriptionConfirmation",
      MessageId: SNS_MESSAGE_ID,
      TopicArn: TOPIC,
      Message: "confirm me",
      SubscribeURL: "http://[",
      Timestamp: "2026-10-23T12:00:00.000Z",
      Token: "abc",
      SignatureVersion: "2",
      SigningCertURL: CERT_URL,
    })

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "SubscribeURL", status: 401 })
    expect(harness.store.has(snsDedupeKey(SNS_MESSAGE_ID))).toBe(false)
  })

  it("uses the database update when no status writer is injected", async () => {
    const harness = createHarness()
    const { updateStatus: _updateStatus, ...dependencies } =
      harness.dependencies

    await handleSesWebhook(
      {
        contentType: "text/plain",
        body: signRecord(baseNotification(sesEvent("Delivery"))),
      },
      dependencies
    )

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("message_status"),
      ["delivered", SES_ID, ["queued", "sent"]]
    )
  })

  it("keeps the claim when redis cannot mark the message finished", async () => {
    const harness = createHarness()
    const release = vi.fn()
    harness.dependencies.dedupe = {
      claim: () => Promise.resolve("claimed"),
      complete: () => Promise.reject(new Error("redis")),
      release,
    }

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent("Delivery"))),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "redis", status: 503 })
    expect(release).not.toHaveBeenCalled()
  })

  it("still reports the status failure when releasing the claim fails", async () => {
    const harness = createHarness()
    harness.dependencies.dedupe = {
      claim: () => Promise.resolve("claimed"),
      complete: () => Promise.resolve(),
      release: () => Promise.reject(new Error("redis")),
    }
    harness.updateStatus.mockRejectedValue(new Error("db down"))

    await expect(
      handleSesWebhook(
        {
          contentType: "text/plain",
          body: signRecord(baseNotification(sesEvent("Delivery"))),
        },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "postgres", status: 503 })
  })

  it("skips a delivery whose SES message id is not usable", async () => {
    const harness = createHarness()

    await handleSesWebhook(
      {
        contentType: "text/plain",
        body: signRecord(
          baseNotification(
            JSON.stringify({
              eventType: "Delivery",
              mail: { messageId: "not valid" },
            })
          )
        ),
      },
      harness.dependencies
    )

    expect(harness.updateStatus).not.toHaveBeenCalled()
  })

  it("rejects a same-length topic mismatch", async () => {
    const harness = createHarness()
    const body = signRecord({
      ...baseNotification(),
      TopicArn: `${TOPIC.slice(0, -1)}x`,
    })

    await expect(
      handleSesWebhook(
        { contentType: "text/plain", body },
        harness.dependencies
      )
    ).rejects.toMatchObject({ detail: "TopicArn", status: 401 })
  })

  it("drops the oldest cached certificate after the cache limit", async () => {
    const certificates = new Map<string, string>()
    for (let index = 0; index < 32; index += 1) {
      certificates.set(`cached-${index}`, "pem")
    }
    const harness = createHarness()
    harness.dependencies.certificates = certificates

    await handleSesWebhook(
      {
        contentType: "text/plain",
        body: signRecord(baseNotification(sesEvent("Send"))),
      },
      harness.dependencies
    )

    expect(certificates.size).toBe(32)
    expect(certificates.has("cached-0")).toBe(false)
    expect(certificates.has(CERT_URL)).toBe(true)
  })
})

function baseNotification(
  message = sesEvent("Delivery")
): Record<string, string> {
  return {
    Type: "Notification",
    MessageId: SNS_MESSAGE_ID,
    TopicArn: TOPIC,
    Message: message,
    Timestamp: "2026-10-23T12:00:00.000Z",
    SignatureVersion: "2",
    SigningCertURL: CERT_URL,
  }
}

function sesEvent(eventType: string): string {
  return JSON.stringify({
    eventType,
    mail: { messageId: SES_ID },
  })
}

function signRecord(
  record: Record<string, string>,
  algorithm: "RSA-SHA1" | "RSA-SHA256" = "RSA-SHA256",
  signatureVersion?: "1" | "2"
): string {
  const signed = signatureVersion
    ? { ...record, SignatureVersion: signatureVersion }
    : record
  const signer = createSign(algorithm)
  signer.update(canonical(signed), "utf8")
  return JSON.stringify({
    ...signed,
    Signature: signer.sign(privateKey, "base64"),
  })
}

function canonical(record: Record<string, string>): string {
  const fields =
    record.Type === "Notification"
      ? Object.prototype.hasOwnProperty.call(record, "Subject")
        ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
        : ["Message", "MessageId", "Timestamp", "TopicArn", "Type"]
      : [
          "Message",
          "MessageId",
          "SubscribeURL",
          "Timestamp",
          "Token",
          "TopicArn",
          "Type",
        ]
  return fields.map((field) => `${field}\n${record[field]}\n`).join("")
}

function createHarness(pem = certificatePem) {
  const store = new Map<string, string>()
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url === CERT_URL) return new Response(pem, { status: 200 })
    return new Response("<ConfirmSubscriptionResponse/>", { status: 200 })
  })
  const updateStatus = vi.fn(async () => undefined)
  const dependencies = {
    fetch: fetchImpl,
    certificates: new Map<string, string>(),
    dedupe: {
      async claim(messageId: string) {
        const key = snsDedupeKey(messageId)
        const current = store.get(key)
        if (current === "done") return "duplicate" as const
        if (current === "pending") return "pending" as const
        store.set(key, "pending")
        return "claimed" as const
      },
      async complete(messageId: string) {
        store.set(snsDedupeKey(messageId), "done")
      },
      async release(messageId: string) {
        store.delete(snsDedupeKey(messageId))
      },
    },
    updateStatus,
    topicArn: TOPIC,
  }
  return { store, fetchImpl, updateStatus, dependencies }
}

function fakeRedis(): SnsRedis & {
  set: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  del: ReturnType<typeof vi.fn>
  values: Map<string, string>
} {
  const values = new Map<string, string>()
  const set = vi.fn(
    async (
      key: string,
      value: string,
      _expiryMode: "EX",
      _ttlSeconds: number,
      condition?: "NX"
    ) => {
      if (condition === "NX" && values.has(key)) return null
      values.set(key, value)
      return "OK" as const
    }
  )
  const get = vi.fn(async (key: string) => values.get(key) ?? null)
  const del = vi.fn(async (key: string) => (values.delete(key) ? 1 : 0))
  return { set, get, del, values }
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

function selfSignedCertificate(
  key: KeyObject,
  notBefore: Date,
  notAfter: Date
): string {
  const jwk = createPublicKey(key).export({ format: "jwk" })
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new Error("expected an RSA key")
  }
  const publicKey = derSequence(
    derInteger(Buffer.from(jwk.n, "base64url")),
    derInteger(Buffer.from(jwk.e, "base64url"))
  )
  const spki = derSequence(rsaAlgorithm(), derBitString(publicKey))
  const tbs = derSequence(
    derInteger(Buffer.from([1])),
    sha256WithRsa(),
    distinguishedName("sns-webhook-test"),
    derSequence(derUtcTime(notBefore), derUtcTime(notAfter)),
    distinguishedName("sns-webhook-test"),
    spki
  )
  const signer = createSign("RSA-SHA256")
  signer.update(tbs)
  const certificate = derSequence(
    tbs,
    sha256WithRsa(),
    derBitString(signer.sign(key))
  )
  const body = certificate
    .toString("base64")
    .match(/.{1,64}/g)
    ?.join("\n")
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`
}

function derSequence(...parts: Buffer[]): Buffer {
  return derTag(0x30, Buffer.concat(parts))
}

function derInteger(value: Buffer): Buffer {
  let body = value.length === 0 ? Buffer.from([0]) : value
  if ((body[0] ?? 0) & 0x80) {
    body = Buffer.concat([Buffer.from([0]), body])
  }
  return derTag(0x02, body)
}

function derBitString(value: Buffer): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([0]), value]))
}

function derUtcTime(date: Date): Buffer {
  const parts = [
    date.getUTCFullYear() % 100,
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ].map((part) => String(part).padStart(2, "0"))
  return derTag(0x17, Buffer.from(`${parts.join("")}Z`, "ascii"))
}

function distinguishedName(commonName: string): Buffer {
  return derSequence(
    derTag(
      0x31,
      derSequence(
        derOid("2.5.4.3"),
        derTag(0x0c, Buffer.from(commonName, "utf8"))
      )
    )
  )
}

function sha256WithRsa(): Buffer {
  return derSequence(derOid("1.2.840.113549.1.1.11"), Buffer.from([0x05, 0x00]))
}

function rsaAlgorithm(): Buffer {
  return derSequence(derOid("1.2.840.113549.1.1.1"), Buffer.from([0x05, 0x00]))
}

function derOid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number)
  const body = [parts[0]! * 40 + parts[1]!]
  for (const part of parts.slice(2)) {
    const encoded = [part & 0x7f]
    let value = part >> 7
    while (value > 0) {
      encoded.unshift((value & 0x7f) | 0x80)
      value >>= 7
    }
    body.push(...encoded)
  }
  return derTag(0x06, Buffer.from(body))
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content])
}

function derLength(length: number): Buffer {
  if (length < 128) return Buffer.from([length])
  const bytes: number[] = []
  let value = length
  while (value > 0) {
    bytes.unshift(value & 0xff)
    value >>= 8
  }
  return Buffer.from([0x80 | bytes.length, ...bytes])
}

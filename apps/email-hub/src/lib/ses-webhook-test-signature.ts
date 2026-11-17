import {
  createPublicKey,
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto"

export const SNS_TOPIC_ARN =
  "arn:aws:sns:us-east-1:123456789012:emailhub-ses-events"
export const SNS_CERT_URL =
  "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-t093.pem"

const pair = generateKeyPairSync("rsa", { modulusLength: 2048 })

export const snsTestPrivateKey: KeyObject = pair.privateKey
export const snsTestCertificatePem = selfSignedCertificate(
  pair.privateKey,
  new Date(Date.now() - 24 * 60 * 60 * 1000),
  new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
)

export function signedSnsNotification(input: {
  messageId: string
  message: string
  signature?: string
  omitSignature?: boolean
}): string {
  const record: Record<string, string> = {
    Type: "Notification",
    MessageId: input.messageId,
    TopicArn: SNS_TOPIC_ARN,
    Message: input.message,
    Timestamp: "2026-10-23T12:00:00.000Z",
    SignatureVersion: "2",
    SigningCertURL: SNS_CERT_URL,
  }
  const body: Record<string, string> = { ...record }
  if (!input.omitSignature) {
    const signer = createSign("RSA-SHA256")
    signer.update(canonical(record), "utf8")
    body.Signature = input.signature ?? signer.sign(snsTestPrivateKey, "base64")
  }
  return JSON.stringify(body)
}

export function sesNotificationMessage(input: {
  eventType: string
  sesMessageId: string
  bounceType?: string
  email?: string
}): string {
  const bounce =
    input.eventType === "Bounce"
      ? {
          bounceType: input.bounceType ?? "Permanent",
          bouncedRecipients: input.email ? [{ emailAddress: input.email }] : [],
        }
      : undefined
  const complaint =
    input.eventType === "Complaint" && input.email
      ? { complainedRecipients: [{ emailAddress: input.email }] }
      : undefined
  return JSON.stringify({
    eventType: input.eventType,
    mail: {
      messageId: input.sesMessageId,
      ...(input.email ? { destination: [input.email] } : {}),
    },
    ...(bounce ? { bounce } : {}),
    ...(complaint ? { complaint } : {}),
  })
}

function canonical(record: Record<string, string>): string {
  const fields = [
    "Message",
    "MessageId",
    "Timestamp",
    "TopicArn",
    "Type",
  ] as const
  return fields.map((field) => `${field}\n${record[field]}\n`).join("")
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

import { describe, expect, it } from "vitest"

import {
  buildUnsubscribeUrl,
  signUnsubscribeToken,
  UnsubscribeTokenError,
  UNSUBSCRIBE_TOKEN_MAX_AGE_MS,
  verifyUnsubscribeToken,
} from "./unsubscribe-token.js"

const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const SECRET = "test-unsubscribe-secret"
const PREVIOUS = "previous-unsubscribe-secret"
const NOW = new Date("2026-11-05T12:00:00.000Z")

describe("unsubscribe tokens", () => {
  it("signs a message id and verifies that token", () => {
    const token = signUnsubscribeToken(SECRET, MESSAGE_ID, { now: NOW })
    expect(token.startsWith(`v1.${MESSAGE_ID}.`)).toBe(true)
    expect(token.split(".")).toHaveLength(4)
    expect(verifyUnsubscribeToken(SECRET, token, { now: NOW })).toEqual({
      status: "valid",
      messageId: MESSAGE_ID,
      issuedAt: NOW,
    })
  })

  it("accepts the previous secret during rotation", () => {
    const token = signUnsubscribeToken(PREVIOUS, MESSAGE_ID, { now: NOW })
    expect(
      verifyUnsubscribeToken([SECRET, PREVIOUS], token, { now: NOW })
    ).toMatchObject({ status: "valid", messageId: MESSAGE_ID })
  })

  it("rejects a token signed with a different secret or a changed message", () => {
    const token = signUnsubscribeToken(SECRET, MESSAGE_ID, { now: NOW })
    expect(verifyUnsubscribeToken("other-secret", token, { now: NOW })).toEqual(
      { status: "invalid" }
    )
    const [version, , iat, mac] = token.split(".")
    expect(
      verifyUnsubscribeToken(
        SECRET,
        `${version}.0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d44.${iat}.${mac}`,
        { now: NOW }
      )
    ).toEqual({ status: "invalid" })
  })

  it("marks tokens older than 180 days as expired", () => {
    const issued = new Date(
      NOW.getTime() - UNSUBSCRIBE_TOKEN_MAX_AGE_MS - 60_000
    )
    const token = signUnsubscribeToken(SECRET, MESSAGE_ID, { now: issued })
    expect(verifyUnsubscribeToken(SECRET, token, { now: NOW })).toEqual({
      status: "expired",
      messageId: MESSAGE_ID,
      issuedAt: new Date(Math.floor(issued.getTime() / 1000) * 1000),
    })
  })

  it("builds page and one-click URLs and refuses a missing origin or secret", () => {
    const url = buildUnsubscribeUrl({
      origin: "http://127.0.0.1:3000/",
      secret: SECRET,
      messageId: MESSAGE_ID,
      now: NOW,
    })
    expect(url.startsWith("http://127.0.0.1:3000/unsubscribe/v1.")).toBe(true)
    const token = url.slice("http://127.0.0.1:3000/unsubscribe/".length)
    expect(verifyUnsubscribeToken(SECRET, token, { now: NOW }).status).toBe(
      "valid"
    )

    const oneClick = buildUnsubscribeUrl({
      origin: "http://127.0.0.1:3000",
      secret: SECRET,
      messageId: MESSAGE_ID,
      path: "api/u",
      now: NOW,
    })
    expect(oneClick.startsWith("http://127.0.0.1:3000/api/u/v1.")).toBe(true)

    expect(() =>
      buildUnsubscribeUrl({
        origin: undefined,
        secret: SECRET,
        messageId: MESSAGE_ID,
      })
    ).toThrow(UnsubscribeTokenError)
    expect(() =>
      buildUnsubscribeUrl({
        origin: "http://127.0.0.1:3000",
        secret: " ",
        messageId: MESSAGE_ID,
      })
    ).toThrow(UnsubscribeTokenError)
  })
})

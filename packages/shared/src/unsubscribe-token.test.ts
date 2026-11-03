import { describe, expect, it } from "vitest"

import {
  buildUnsubscribeUrl,
  signUnsubscribeToken,
  UnsubscribeTokenError,
  verifyUnsubscribeToken,
} from "./unsubscribe-token.js"

const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const SECRET = "test-unsubscribe-secret"

describe("unsubscribe tokens", () => {
  it("signs a message id and verifies that token", () => {
    const token = signUnsubscribeToken(SECRET, MESSAGE_ID)
    expect(token.startsWith(`v1.${MESSAGE_ID}.`)).toBe(true)
    expect(verifyUnsubscribeToken(SECRET, token)).toBe(MESSAGE_ID)
  })

  it("rejects a token signed with a different secret or a changed message", () => {
    const token = signUnsubscribeToken(SECRET, MESSAGE_ID)
    expect(verifyUnsubscribeToken("other-secret", token)).toBeNull()
    const [version, , mac] = token.split(".")
    expect(
      verifyUnsubscribeToken(
        SECRET,
        `${version}.0192f6c0-7a3e-7c1e-8d2b-3f6a5b8c1d44.${mac}`
      )
    ).toBeNull()
  })

  it("builds an http(s) unsubscribe URL and refuses a missing origin or secret", () => {
    const url = buildUnsubscribeUrl({
      origin: "http://127.0.0.1:3000/",
      secret: SECRET,
      messageId: MESSAGE_ID,
    })
    expect(url.startsWith("http://127.0.0.1:3000/unsubscribe/v1.")).toBe(true)
    const token = url.slice("http://127.0.0.1:3000/unsubscribe/".length)
    expect(verifyUnsubscribeToken(SECRET, token)).toBe(MESSAGE_ID)
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

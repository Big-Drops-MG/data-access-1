import { getContextLogger, getRequestId, maskEmail } from "@workspace/logger"

/** SD#15.2 key auth events. Field list beyond user_id and request_id is unverified. */

export type AuthEventName =
  | "auth.login"
  | "auth.login_failed"
  | "auth.2fa_failed"
  | "auth.lockout"
  | "auth.lockout_admin_required"
  | "auth.2fa_enrolled"
  | "auth.2fa_reset"

export type AuthEventFields = {
  user_id?: string
  request_id?: string
  [key: string]: string | number | boolean | undefined
}

export type AuthEventSink = (
  level: "info" | "warn",
  event: AuthEventName,
  fields: AuthEventFields
) => void

const defaultSink: AuthEventSink = (level, event, fields) => {
  const logger = getContextLogger()
  const payload = { event, ...fields }
  if (level === "info") {
    logger.info(payload, event)
    return
  }
  logger.warn(payload, event)
}

let sink: AuthEventSink = defaultSink

/** Test helper — replace or restore the log sink. */
export function setAuthEventSink(next: AuthEventSink | undefined): void {
  sink = next ?? defaultSink
}

export function logAuthEvent(
  event: AuthEventName,
  fields: AuthEventFields = {}
): void {
  const level =
    event === "auth.login" ||
    event === "auth.2fa_enrolled" ||
    event === "auth.2fa_reset"
      ? "info"
      : "warn"
  const requestId = fields.request_id ?? getRequestId()
  const payload: AuthEventFields = { ...fields }
  if (requestId !== undefined && payload.request_id === undefined) {
    payload.request_id = requestId
  }
  if (typeof payload.email === "string") {
    payload.email = maskEmail(payload.email)
  }
  sink(level, event, payload)
}

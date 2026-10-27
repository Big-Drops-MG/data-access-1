/** SD#15.2 key auth events (structured logs until T-058 Pino lands). */

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
  // Until T-058 Pino: structured line on stderr (no-console allows warn/error only).
  console.warn(
    JSON.stringify({
      level,
      time: new Date().toISOString(),
      service: "web",
      event,
      ...fields,
    })
  )
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
  sink(level, event, fields)
}

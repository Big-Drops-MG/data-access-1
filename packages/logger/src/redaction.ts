export const REDACT_CENSOR = "[REDACTED]"

/**
 * Path-based Pino redaction keys. This does not scan arbitrary free text.
 * Credential URLs in error messages are scrubbed separately in serializeError.
 */
const SENSITIVE_KEYS = [
  "password",
  "confirmPassword",
  "confirm_password",
  "ConfirmPassword",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "cookies",
  "set-cookie",
  "Set-Cookie",
  "setCookie",
  "set_cookie",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "sessionToken",
  "session_token",
  "apiKey",
  "api_key",
  "apiSecret",
  "api_secret",
  "awsAccessKeyId",
  "awsSecretAccessKey",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "REDIS_URL",
  "CLICKHOUSE_URL",
  "SMTP_PASSWORD",
  "smtpPassword",
  "smtp_password",
  "IMAP_PASSWORD",
  "imapPassword",
  "BETTER_AUTH_SECRET",
  "betterAuthSecret",
  "GOOGLE_CLIENT_SECRET",
  "googleClientSecret",
  "APP_ENCRYPTION_KEY",
  "UNSUBSCRIBE_TOKEN_SECRET",
  "unsubscribeTokenSecret",
  "unsubscribeToken",
  "unsubscribe_token",
  "unsubscribeUrl",
  "unsubscribe_url",
  "webhookSecret",
  "webhook_secret",
  "secret",
  "token",
  "Token",
  "privateKey",
  "private_key",
  "connectionString",
  "connection_string",
  "html",
  "text",
] as const

function isIdentifier(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
}

function fieldPath(depth: number, key: string): string {
  if (depth === 0) {
    return isIdentifier(key) ? key : `["${key}"]`
  }
  const prefix = Array.from({ length: depth }, () => "*").join(".")
  return isIdentifier(key) ? `${prefix}.${key}` : `${prefix}["${key}"]`
}

function headerPaths(key: string): string[] {
  if (isIdentifier(key)) {
    return [
      `headers.${key}`,
      `*.headers.${key}`,
      `req.headers.${key}`,
      `res.headers.${key}`,
    ]
  }
  return [
    `headers["${key}"]`,
    `*.headers["${key}"]`,
    `req.headers["${key}"]`,
    `res.headers["${key}"]`,
  ]
}

export const REDACT_PATHS: string[] = SENSITIVE_KEYS.flatMap((key) => [
  ...[0, 1, 2, 3, 4].map((depth) => fieldPath(depth, key)),
  ...headerPaths(key),
])

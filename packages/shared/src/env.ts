import { z } from "zod"

export type ServerEnvRole = "web" | "worker"

const emptyToUndefined = (value: unknown): unknown => {
  if (value === undefined || value === null) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  return value
}

const requiredString = z.preprocess(
  emptyToUndefined,
  z.string().min(1, "is required")
)

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
)

const mailTransportSchema = z.preprocess(
  emptyToUndefined,
  z.enum(["smtp", "ses"]).default("smtp")
)

const e2eSchema = z.preprocess(
  emptyToUndefined,
  z.enum(["1", "true"]).optional()
)

const baseEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    /** Deploy target. `dev` may use SMTP/Mailpit; `prod` requires SES and no E2E. */
    EMAILHUB_ENV: z.preprocess(
      emptyToUndefined,
      z.enum(["dev", "prod"]).optional()
    ),
    DATABASE_URL: requiredString,
    REDIS_URL: requiredString,
    CLICKHOUSE_URL: requiredString,
    MAIL_TRANSPORT: mailTransportSchema,
    SMTP_HOST: optionalString,
    SMTP_PORT: optionalString,
    SES_REGION: optionalString,
    SES_CONFIGURATION_SET: optionalString,
    SES_MAX_SEND_RATE: optionalString,
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    E2E: e2eSchema,
    SENTRY_DSN: optionalString,
    APP_ENCRYPTION_KEY: optionalString,
    UNSUBSCRIBE_TOKEN_SECRET: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.MAIL_TRANSPORT === "smtp") {
      if (!env.SMTP_HOST) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_HOST"],
          message: "is required when MAIL_TRANSPORT=smtp",
        })
      }
      if (!env.SMTP_PORT) {
        ctx.addIssue({
          code: "custom",
          path: ["SMTP_PORT"],
          message: "is required when MAIL_TRANSPORT=smtp",
        })
      }
    }

    if (env.MAIL_TRANSPORT === "ses" && !env.SES_REGION) {
      ctx.addIssue({
        code: "custom",
        path: ["SES_REGION"],
        message: "is required when MAIL_TRANSPORT=ses",
      })
    }

    const isProdDeploy =
      env.EMAILHUB_ENV === "prod" ||
      (env.NODE_ENV === "production" && env.EMAILHUB_ENV !== "dev")

    if (isProdDeploy) {
      if (env.MAIL_TRANSPORT !== "ses") {
        ctx.addIssue({
          code: "custom",
          path: ["MAIL_TRANSPORT"],
          message: "must be ses in production (EMAILHUB_ENV=prod)",
        })
      }
      if (env.E2E !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["E2E"],
          message: "must not be set in production",
        })
      }
    }
  })

const webEnvSchema = baseEnvSchema.and(
  z.object({
    BETTER_AUTH_SECRET: requiredString,
    BETTER_AUTH_URL: requiredString,
    GOOGLE_CLIENT_ID: requiredString,
    GOOGLE_CLIENT_SECRET: requiredString,
    ADMIN_EMAILS: optionalString,
  })
)

export type ServerEnv = z.infer<typeof baseEnvSchema>
export type WebServerEnv = z.infer<typeof webEnvSchema>

export class EnvValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(
      `Invalid environment:\n${issues.map((issue) => `- ${issue}`).join("\n")}`
    )
    this.name = "EnvValidationError"
    this.issues = issues
  }
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "env"
    return `${path}: ${issue.message}`
  })
}

export function parseServerEnv(
  source: NodeJS.ProcessEnv = process.env,
  role: ServerEnvRole = "worker"
): ServerEnv | WebServerEnv {
  const schema = role === "web" ? webEnvSchema : baseEnvSchema
  const result = schema.safeParse(source)
  if (!result.success) {
    throw new EnvValidationError(formatZodIssues(result.error))
  }
  return result.data
}

let cachedWebEnv: WebServerEnv | undefined
let cachedWorkerEnv: ServerEnv | undefined

export function loadServerEnv(
  role: ServerEnvRole = "worker"
): ServerEnv | WebServerEnv {
  if (role === "web") {
    if (!cachedWebEnv) {
      cachedWebEnv = parseServerEnv(process.env, "web") as WebServerEnv
    }
    return cachedWebEnv
  }
  if (!cachedWorkerEnv) {
    cachedWorkerEnv = parseServerEnv(process.env, "worker")
  }
  return cachedWorkerEnv
}

export function resetServerEnvCache(): void {
  cachedWebEnv = undefined
  cachedWorkerEnv = undefined
}

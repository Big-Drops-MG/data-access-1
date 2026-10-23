export const PACKAGE_NAME = "@workspace/shared" as const

export { hashEmail, maskEmail, normaliseEmail } from "./email.js"
export {
  findOrCreateRecipient,
  lockRecipientTx,
  triggerEmail,
  type EmailHubDb,
  type EmailHubTx,
  type TriggerEmailCreateContext,
  type TriggerEmailInput,
  type TriggerEmailResult,
} from "./trigger-email.js"
export {
  AppError,
  ERROR_CODES,
  ERROR_STATUS,
  isAppError,
  isErrorCode,
  type AppErrorBody,
  type AppErrorDetail,
  type ErrorCode,
} from "./errors.js"
export {
  emailSchema,
  isoUtcTimestampSchema,
  paginationSchema,
  uuidSchema,
  type Email,
  type IsoUtcTimestamp,
  type Pagination,
  type Uuid,
} from "./schemas.js"
export {
  EnvValidationError,
  loadServerEnv,
  parseServerEnv,
  resetServerEnvCache,
  type ServerEnv,
  type ServerEnvRole,
  type WebServerEnv,
} from "./env.js"
export {
  ET_TIME_ZONE,
  etToUtc,
  formatEtDate,
  formatEtDateTime,
  formatEtTime,
  getEtAbbreviation,
  getEtDayRange,
  getEtReportRange,
  getEtWallTime,
  parseEtDateString,
  resolveEtWallTime,
  utcToEt,
  type EtDayRange,
  type EtResolveAmbiguous,
  type EtResolveNonexistent,
  type EtResolveOk,
  type EtResolveResult,
  type EtToUtcDisambiguation,
  type EtWallTime,
} from "./time.js"

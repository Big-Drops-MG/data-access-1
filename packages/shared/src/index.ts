export const PACKAGE_NAME = "@workspace/shared" as const

export { hashEmail, maskEmail, normaliseEmail } from "./email.js"
export {
  assertMergeDataHasRequiredTags,
  findOrCreateRecipient,
  loadRouteSendAssets,
  lockRecipientTx,
  noRouteAlertDedupeKey,
  openNoRouteAlert,
  requiredMergeTagNames,
  resolveEmailRoute,
  triggerEmail,
  type EmailHubDb,
  type EmailHubTx,
  type MergeData,
  type ResolvedRouteAssets,
  type TriggerEmailCreateContext,
  type TriggerEmailInput,
  type TriggerEmailResult,
  type TriggerEmailType,
} from "./trigger-email.js"
export {
  firstFailedSendCheck,
  insertSkippedSendCheckMessage,
  isTransactionalEmailType,
  runSendChecks,
  type SendCheckFacts,
  type SendCheckSkipReason,
} from "./send-checks.js"
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
  JOB_TITLES,
  isJobTitle,
  jobTitleSchema,
  type JobTitle,
} from "./job-title.js"
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

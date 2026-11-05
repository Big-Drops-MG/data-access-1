export const PACKAGE_NAME = "@workspace/shared" as const

export { hashEmail, maskEmail, normaliseEmail } from "./email.js"
export {
  writeAudit,
  type AuditActor,
  type AuditActorType,
  type WriteAuditInput,
} from "./audit.js"
export {
  assertMergeDataHasRequiredTags,
  findOrCreateRecipient,
  insertQueuedMessage,
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
  type TriggerEmailDeps,
  type TriggerEmailInput,
  type TriggerEmailResult,
  type TriggerEmailType,
} from "./trigger-email.js"
export { buildMergeTagsRecord, extractMergeTagNames } from "./merge-tags.js"
export {
  applyRenderedComplianceMergeData,
  fillMissingComplianceMergeData,
  MESSAGE_ENVIRONMENTS,
  messageEnvironment,
  PENDING_UNSUBSCRIBE_MERGE_VALUE,
  POSTAL_ADDRESS_MERGE_TAG,
  UNSUBSCRIBE_MERGE_TAG,
  type MessageEnvironment,
} from "./compliance-tags.js"
export {
  buildUnsubscribeUrl,
  signUnsubscribeToken,
  UnsubscribeTokenError,
  UNSUBSCRIBE_TOKEN_MAX_AGE_MS,
  verifyUnsubscribeToken,
  type UnsubscribeTokenVerification,
} from "./unsubscribe-token.js"
export {
  applyUnsubscribe,
  LIST_UNSUBSCRIBE_ONE_CLICK_BODY,
  parseUnsubscribeRequestBody,
  type ApplyUnsubscribeInput,
  type ApplyUnsubscribeResult,
  type ApplyUnsubscribeScope,
} from "./apply-unsubscribe.js"
export {
  BULLMQ_PREFIX,
  SEND_EMAIL_JOB_NAME,
  SEND_EMAIL_JOB_OPTIONS,
  SEND_EMAIL_QUEUE_NAME,
  createEnqueueSendEmail,
  enqueueSendEmailJob,
  type SendEmailJobData,
} from "./send-email-queue.js"
export {
  EVENTS_JOB_NAME,
  EVENTS_JOB_OPTIONS,
  EVENTS_QUEUE_NAME,
  createEnqueueEvents,
  enqueueEventsJob,
  extractDomain,
  mapSesEventTypeToClickHouse,
  parseUserAgentEnvironment,
  type EventsJobData,
  type EventsQueue,
  type NormalizedEmailEventRecord,
  type ParsedUserAgentEnvironment,
} from "./events-queue.js"
export {
  SES_ACCOUNT_PAUSED_ALERT_TYPE,
  SES_ACCOUNT_PAUSED_DEDUPE_KEY,
  claimQueuedMessage,
  loadQueuedSend,
  markMessageFailed,
  markMessageSent,
  releaseQueuedClaim,
  openSesAccountPausedAlert,
  runSendEmailExclusive,
  skipQueuedMessageIfBlocked,
  type LoadQueuedSendResult,
  type QueuedSendContext,
} from "./send-email-delivery.js"
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
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  appErrorFromPostgresConstraint,
  getPostgresErrorCode,
  isForeignKeyViolation,
  isUniqueViolation,
} from "./postgres-errors.js"
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
  sesSendRatePerSecond,
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

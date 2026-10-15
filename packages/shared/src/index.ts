export const PACKAGE_NAME = "@workspace/shared" as const

export { maskEmail, normaliseEmail } from "./email.js"
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
  ET_TIME_ZONE,
  formatEtDate,
  formatEtDateTime,
  formatEtTime,
  getEtAbbreviation,
  getEtWallTime,
  resolveEtWallTime,
  type EtResolveAmbiguous,
  type EtResolveNonexistent,
  type EtResolveOk,
  type EtResolveResult,
  type EtWallTime,
} from "./time.js"

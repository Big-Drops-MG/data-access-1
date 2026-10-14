export const PACKAGE_NAME = "@workspace/shared" as const

export { maskEmail, normaliseEmail } from "./email.js"
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

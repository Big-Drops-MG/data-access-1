/**
 * Provisional structured fields for T-058.
 * SD#15.2 was not available in the repo or Notion, so these names follow the
 * task's provisional list and existing auth-event fields. They are not a
 * verified copy of SD#15.2.
 */
export type LogBindings = {
  request_id?: string
  service?: string
  environment?: string
  event?: string
  workspace_id?: string
  user_id?: string
  job_id?: string
  message_id?: string
  duration_ms?: number
  error_code?: string
  recipient?: string
  queue?: string
  attempt?: number
  template_id?: string
  domain_id?: string
  provider_message_id?: string
  transport?: "ses" | "smtp"
  method?: string
  path?: string
  status?: number
  detail?: string
}

export type SerializedError = {
  type: string
  message: string
  error_code?: string
  stack?: string
  cause?: SerializedError
}

export type JobCorrelation = {
  requestId?: string
  messageId?: string
  workspaceId?: string
}

export const WEB_SERVICE = "emailhub-web"
export const WORKER_SERVICE = "emailhub-worker"

export const TEMPLATE_RENDER_ERROR_CODES = [
  "invalid_input",
  "unsupported_source",
  "forbidden_import",
  "merge_data",
  "compliance",
  "timeout",
  "worker_crashed",
  "render_failed",
] as const

export type TemplateRenderErrorCode =
  (typeof TEMPLATE_RENDER_ERROR_CODES)[number]

export class TemplateRenderError extends Error {
  readonly code: TemplateRenderErrorCode

  constructor(code: TemplateRenderErrorCode, message: string) {
    super(message)
    this.name = "TemplateRenderError"
    this.code = code
  }
}

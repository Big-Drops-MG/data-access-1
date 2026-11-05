import {
  TemplateRenderError,
  renderEmailTemplate,
} from "@workspace/emails/render"
import {
  AppError,
  POSTAL_ADDRESS_MERGE_TAG,
  UNSUBSCRIBE_MERGE_TAG,
  extractMergeTagNames,
  type AppErrorDetail,
} from "@workspace/shared"

const PUBLISH_MERGE_PLACEHOLDER = "https://example.com/publish-check/value"
const FOOTER_UNSUBSCRIBE_URL = "https://example.com/publish-check/footer"
const TAG_UNSUBSCRIBE_URL = "https://example.com/publish-check/unsubscribe"
const FOOTER_POSTAL_ADDRESS = "Publish Check Footer Address"
const TAG_POSTAL_ADDRESS = "Publish Check Postal Address"

export type PublishValidationInput = {
  subject: string
  bodySource: string
  categoryKind: string
}

/**
 * Render the version with the T-054 renderer and, for every category kind
 * other than `transactional`, require live `{{unsubscribe_url}}` and
 * `{{postal_address}}` merge tags in the body output.
 *
 * Sample values are publish-check placeholders. This does not send mail and
 * does not cover every future merge payload.
 */
export async function validateTemplateForPublishing(
  input: PublishValidationInput
): Promise<void> {
  const tagNames = extractMergeTagNames(input.subject, input.bodySource)
  const mergeData: Record<string, string> = {}
  for (const name of tagNames) {
    mergeData[name] = PUBLISH_MERGE_PLACEHOLDER
  }
  mergeData[UNSUBSCRIBE_MERGE_TAG] = TAG_UNSUBSCRIBE_URL
  mergeData[POSTAL_ADDRESS_MERGE_TAG] = TAG_POSTAL_ADDRESS

  let rendered: { html: string; text: string }
  try {
    rendered = await renderEmailTemplate({
      source: input.bodySource,
      subject: input.subject,
      mergeData,
      unsubscribeUrl: FOOTER_UNSUBSCRIBE_URL,
      postalAddress: FOOTER_POSTAL_ADDRESS,
    })
  } catch (error) {
    throw publishRenderError(error)
  }

  if (input.categoryKind === "transactional") {
    return
  }

  const bodyTags = new Set(extractMergeTagNames(input.bodySource))
  const details: AppErrorDetail[] = [
    complianceDetail(
      bodyTags,
      rendered,
      UNSUBSCRIBE_MERGE_TAG,
      TAG_UNSUBSCRIBE_URL,
      "TEMPLATE_UNSUBSCRIBE_TAG_MISSING",
      "TEMPLATE_UNSUBSCRIBE_TAG_INVALID"
    ),
    complianceDetail(
      bodyTags,
      rendered,
      POSTAL_ADDRESS_MERGE_TAG,
      TAG_POSTAL_ADDRESS,
      "TEMPLATE_POSTAL_ADDRESS_TAG_MISSING",
      "TEMPLATE_POSTAL_ADDRESS_TAG_INVALID"
    ),
  ].filter((detail): detail is AppErrorDetail => detail !== null)

  if (details.length > 0) {
    throw AppError.validationFailed(details)
  }
}

function complianceDetail(
  bodyTags: Set<string>,
  rendered: { html: string; text: string },
  tagName: string,
  sentinel: string,
  missingCode: string,
  invalidCode: string
): AppErrorDetail | null {
  const inOutput =
    rendered.html.includes(sentinel) && rendered.text.includes(sentinel)
  if (inOutput) {
    return null
  }
  return {
    path: "body_source",
    message: bodyTags.has(tagName) ? invalidCode : missingCode,
  }
}

function publishRenderError(error: unknown): AppError {
  if (error instanceof TemplateRenderError) {
    return AppError.validationFailed([
      {
        path: "body_source",
        message:
          error.code === "timeout"
            ? "TEMPLATE_RENDER_TIMEOUT"
            : "TEMPLATE_RENDER_FAILED",
      },
    ])
  }
  if (error instanceof AppError) {
    return error
  }
  throw error
}

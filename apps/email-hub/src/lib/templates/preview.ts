import {
  TemplateRenderError,
  renderEmailTemplate,
} from "@workspace/emails/render"
import { AppError, extractMergeTagNames } from "@workspace/shared"

const PREVIEW_UNSUBSCRIBE_URL = "https://example.com/preview/unsubscribe"
const PREVIEW_POSTAL_ADDRESS = "123 Preview Street, Sample City, ST 00000"

/** Sample merge values for the sandboxed operator preview (Maria). */
export const PREVIEW_SAMPLE_MERGE: Readonly<Record<string, string>> = {
  first_name: "Maria",
  offer_name: "Sample offer",
  cta_url: "https://example.com/preview/cta",
  postal_address: PREVIEW_POSTAL_ADDRESS,
  unsubscribe_url: PREVIEW_UNSUBSCRIBE_URL,
  tier_label: "Premium",
}

export type PreviewTemplateInput = {
  subject: string
  bodySource: string
  mergeData?: Record<string, string>
}

export type PreviewTemplateResult = {
  html: string
  text: string
  subject: string
  missing_tags: string[]
}

/**
 * Render subject/source with sample merge data for the operator preview pane.
 * Does not send mail. Missing tags are reported and replaced with a visible
 * placeholder so the iframe still shows structure.
 */
export async function previewTemplate(
  input: PreviewTemplateInput
): Promise<PreviewTemplateResult> {
  const tagNames = extractMergeTagNames(input.subject, input.bodySource)
  const mergeData: Record<string, string> = {
    ...PREVIEW_SAMPLE_MERGE,
    ...(input.mergeData ?? {}),
  }
  const missing: string[] = []
  for (const name of tagNames) {
    const value = mergeData[name]
    if (value == null || value.trim() === "") {
      missing.push(name)
      mergeData[name] = `[missing:${name}]`
    }
  }

  try {
    const rendered = await renderEmailTemplate({
      source: input.bodySource,
      subject: input.subject,
      mergeData,
      unsubscribeUrl: PREVIEW_UNSUBSCRIBE_URL,
      postalAddress: PREVIEW_POSTAL_ADDRESS,
    })
    return {
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
      missing_tags: missing,
    }
  } catch (error) {
    if (error instanceof TemplateRenderError) {
      throw AppError.validationFailed([
        {
          path: "body_source",
          message:
            error.code === "timeout"
              ? "TEMPLATE_RENDER_TIMEOUT"
              : error.code === "merge_data"
                ? "TEMPLATE_PREVIEW_MERGE_FAILED"
                : "TEMPLATE_RENDER_FAILED",
        },
      ])
    }
    throw error
  }
}

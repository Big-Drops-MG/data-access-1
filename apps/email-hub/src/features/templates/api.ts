import { apiJson } from "@/lib/api-client"
import type { EmailCategoryJson } from "@/lib/email-categories/serialize"
import type {
  TemplateJson,
  TemplateVersionJson,
} from "@/lib/templates/serialize"

export type TemplateListItem = TemplateJson

export type TemplateDetail = TemplateJson & {
  versions: TemplateVersionJson[]
}

export type TemplatesListResponse = {
  data: TemplateListItem[]
  next_cursor: string | null
}

export type TemplatesListParams = {
  limit?: number
  cursor?: string
  status?: TemplateJson["status"]
  email_type?: TemplateJson["email_type"]
  category_id?: string
}

export type EmailType = TemplateJson["email_type"]

function toSearchParams(params: TemplatesListParams = {}): string {
  const search = new URLSearchParams()
  if (params.limit != null) {
    search.set("limit", String(params.limit))
  }
  if (params.cursor) {
    search.set("cursor", params.cursor)
  }
  if (params.status) {
    search.set("status", params.status)
  }
  if (params.email_type) {
    search.set("email_type", params.email_type)
  }
  if (params.category_id) {
    search.set("category_id", params.category_id)
  }
  const text = search.toString()
  return text ? `?${text}` : ""
}

export function fetchTemplatesList(
  params: TemplatesListParams = {}
): Promise<TemplatesListResponse> {
  return apiJson<TemplatesListResponse>(
    `/api/templates${toSearchParams(params)}`
  )
}

export function fetchTemplate(id: string): Promise<TemplateDetail> {
  return apiJson<TemplateDetail>(`/api/templates/${encodeURIComponent(id)}`)
}

export function fetchEmailCategories(): Promise<{ data: EmailCategoryJson[] }> {
  return apiJson<{ data: EmailCategoryJson[] }>("/api/email-categories")
}

export type CreateTemplateInput = {
  name: string
  category_id: string
  email_type: EmailType
}

export function createTemplate(
  input: CreateTemplateInput
): Promise<TemplateListItem> {
  return apiJson<TemplateListItem>("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

export type CreateTemplateVersionInput = {
  subject: string
  body_source: string
}

export function createTemplateVersion(
  templateId: string,
  input: CreateTemplateVersionInput
): Promise<TemplateVersionJson> {
  return apiJson<TemplateVersionJson>(
    `/api/templates/${encodeURIComponent(templateId)}/versions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }
  )
}

export function publishTemplateVersion(
  templateId: string,
  versionId: string
): Promise<TemplateListItem> {
  return apiJson<TemplateListItem>(
    `/api/templates/${encodeURIComponent(templateId)}/publish`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version_id: versionId }),
    }
  )
}

export type TestSendResult = {
  message_id: string
  status: string
  environment: string
}

export function testSendTemplate(
  templateId: string,
  versionId: string,
  mergeData?: Record<string, string>
): Promise<TestSendResult> {
  return apiJson<TestSendResult>(
    `/api/templates/${encodeURIComponent(templateId)}/test-send`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        version_id: versionId,
        ...(mergeData ? { merge_data: mergeData } : {}),
      }),
    }
  )
}

export type PreviewResult = {
  html: string
  text: string
  subject: string
  missing_tags: string[]
}

export function previewTemplate(input: {
  subject: string
  body_source: string
  merge_data?: Record<string, string>
}): Promise<PreviewResult> {
  return apiJson<PreviewResult>("/api/templates/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  })
}

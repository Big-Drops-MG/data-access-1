import type { Template, TemplateVersion } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type TemplateJson = {
  id: string
  name: string
  email_type: Template["emailType"]
  category_id: string
  current_version_id: string | null
  status: Template["status"]
  created_by: string
  created_at: string
  updated_at: string
}

export type TemplateVersionJson = {
  id: string
  template_id: string
  version_no: number
  subject: string
  body_source: string
  merge_tags: unknown
  created_by: string
  created_at: string
}

export function serializeTemplate(row: Template): TemplateJson {
  return {
    id: row.id,
    name: row.name,
    email_type: row.emailType,
    category_id: row.categoryId,
    current_version_id: row.currentVersionId,
    status: row.status,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
  }
}

export function serializeTemplateVersion(
  row: TemplateVersion
): TemplateVersionJson {
  return {
    id: row.id,
    template_id: row.templateId,
    version_no: row.versionNo,
    subject: row.subject,
    body_source: row.bodySource,
    merge_tags: row.mergeTags,
    created_by: row.createdBy,
    created_at: isoUtc(row.createdAt),
  }
}

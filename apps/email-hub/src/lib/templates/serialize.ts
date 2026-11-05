import type { EmailCategory, Template, TemplateVersion } from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type TemplateJson = {
  id: string
  name: string
  email_type: Template["emailType"]
  category_id: string
  category_name: string
  category_kind: EmailCategory["kind"]
  current_version_id: string | null
  current_version_no: number | null
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

export type TemplateSerializeExtras = {
  category_name: string
  category_kind: EmailCategory["kind"]
  current_version_no: number | null
}

export function serializeTemplate(
  row: Template,
  extras: TemplateSerializeExtras
): TemplateJson {
  return {
    id: row.id,
    name: row.name,
    email_type: row.emailType,
    category_id: row.categoryId,
    category_name: extras.category_name,
    category_kind: extras.category_kind,
    current_version_id: row.currentVersionId,
    current_version_no: extras.current_version_no,
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

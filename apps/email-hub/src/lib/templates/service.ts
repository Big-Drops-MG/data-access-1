import { and, desc, eq, lt, max } from "drizzle-orm"

import {
  emailCategory,
  emailRoute,
  template,
  templateVersion,
  type Template,
  type TemplateVersion,
} from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, buildMergeTagsRecord, writeAudit } from "@workspace/shared"

import {
  serializeTemplate,
  serializeTemplateVersion,
  type TemplateJson,
  type TemplateVersionJson,
} from "./serialize"

type Db = Database | DatabaseTransaction

export type TemplateActor = {
  userId: string
  requestId?: string | null
}

export type ListTemplatesInput = {
  limit: number
  cursor?: string
  status?: Template["status"]
  emailType?: Template["emailType"]
  categoryId?: string
}

export type CreateTemplateInput = {
  name: string
  categoryId: string
  emailType: Template["emailType"]
}

export type UpdateTemplateInput = {
  name?: string
  categoryId?: string
  status?: Template["status"]
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  )
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23503"
  )
}

async function requireTemplate(db: Db, id: string): Promise<Template> {
  const [row] = await db
    .select()
    .from(template)
    .where(eq(template.id, id))
    .limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "Template not found" }])
  }
  return row
}

async function requireCategory(db: Db, categoryId: string): Promise<void> {
  const [row] = await db
    .select({ id: emailCategory.id })
    .from(emailCategory)
    .where(eq(emailCategory.id, categoryId))
    .limit(1)
  if (!row) {
    throw AppError.validationFailed([
      { path: "category_id", message: "Category not found" },
    ])
  }
}

async function listActiveRoutesForTemplate(
  db: Db,
  templateId: string
): Promise<{ id: string }[]> {
  return db
    .select({ id: emailRoute.id })
    .from(emailRoute)
    .where(
      and(
        eq(emailRoute.templateId, templateId),
        eq(emailRoute.status, "active")
      )
    )
}

export async function listTemplates(
  input: ListTemplatesInput,
  db: Database = getDb()
): Promise<{ data: TemplateJson[]; next_cursor: string | null }> {
  const conditions = []
  if (input.status) {
    conditions.push(eq(template.status, input.status))
  }
  if (input.emailType) {
    conditions.push(eq(template.emailType, input.emailType))
  }
  if (input.categoryId) {
    conditions.push(eq(template.categoryId, input.categoryId))
  }
  if (input.cursor) {
    conditions.push(lt(template.id, input.cursor))
  }

  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions)

  const rows = await db
    .select()
    .from(template)
    .where(where)
    .orderBy(desc(template.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit)
  const next = rows.length > input.limit ? (page.at(-1)?.id ?? null) : null

  return {
    data: page.map(serializeTemplate),
    next_cursor: next,
  }
}

export async function getTemplate(
  id: string,
  db: Database = getDb()
): Promise<TemplateJson & { versions: TemplateVersionJson[] }> {
  const row = await requireTemplate(db, id)
  const versions = await db
    .select()
    .from(templateVersion)
    .where(eq(templateVersion.templateId, id))
    .orderBy(desc(templateVersion.versionNo))

  return {
    ...serializeTemplate(row),
    versions: versions.map(serializeTemplateVersion),
  }
}

export async function createTemplate(
  input: CreateTemplateInput,
  actor: TemplateActor,
  db: Database = getDb()
): Promise<TemplateJson> {
  await requireCategory(db, input.categoryId)

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(template)
        .values({
          name: input.name,
          categoryId: input.categoryId,
          emailType: input.emailType,
          status: "draft",
          createdBy: actor.userId,
        })
        .returning()

      if (!row) {
        throw AppError.internal()
      }

      await writeAudit(tx, {
        actor: { type: "user", id: actor.userId },
        action: "template.create",
        objectType: "template",
        objectId: row.id,
        requestId: actor.requestId,
        after: serializeTemplate(row),
      })

      return serializeTemplate(row)
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict([
        { path: "name", message: "A template with this name already exists" },
      ])
    }
    throw error
  }
}

export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
  actor: TemplateActor,
  db: Database = getDb()
): Promise<TemplateJson> {
  return db.transaction(async (tx) => {
    const before = await requireTemplate(tx, id)

    if (input.categoryId !== undefined) {
      await requireCategory(tx, input.categoryId)
    }

    if (input.status === "archived" && before.status !== "archived") {
      const routes = await listActiveRoutesForTemplate(tx, id)
      if (routes.length > 0) {
        throw AppError.conflict(
          routes.map((route) => ({
            path: "email_route",
            message: route.id,
          }))
        )
      }
    }

    let row: Template
    try {
      const [updated] = await tx
        .update(template)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.categoryId !== undefined
            ? { categoryId: input.categoryId }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(template.id, id))
        .returning()
      if (!updated) {
        throw AppError.notFound([{ path: "id", message: "Template not found" }])
      }
      row = updated
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict([
          { path: "name", message: "A template with this name already exists" },
        ])
      }
      if (isForeignKeyViolation(error)) {
        throw AppError.validationFailed([
          { path: "category_id", message: "Category not found" },
        ])
      }
      throw error
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "template.update",
      objectType: "template",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeTemplate(before),
      after: serializeTemplate(row),
    })

    return serializeTemplate(row)
  })
}

export async function createTemplateVersion(
  templateId: string,
  input: { subject: string; bodySource: string },
  actor: TemplateActor,
  db: Database = getDb()
): Promise<TemplateVersionJson> {
  return db.transaction(async (tx) => {
    await requireTemplate(tx, templateId)

    const [agg] = await tx
      .select({ maxNo: max(templateVersion.versionNo) })
      .from(templateVersion)
      .where(eq(templateVersion.templateId, templateId))

    const versionNo = (agg?.maxNo ?? 0) + 1
    const mergeTags = buildMergeTagsRecord(input.subject, input.bodySource)

    let row: TemplateVersion
    try {
      const [inserted] = await tx
        .insert(templateVersion)
        .values({
          templateId,
          versionNo,
          subject: input.subject,
          bodySource: input.bodySource,
          mergeTags,
          createdBy: actor.userId,
        })
        .returning()
      if (!inserted) {
        throw AppError.internal()
      }
      row = inserted
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict([
          {
            path: "version_no",
            message: "Concurrent version create; retry",
          },
        ])
      }
      throw error
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "template_version.create",
      objectType: "template_version",
      objectId: row.id,
      requestId: actor.requestId,
      after: serializeTemplateVersion(row),
    })

    return serializeTemplateVersion(row)
  })
}

/**
 * Atomically set `template.current_version_id` (SD#9.3).
 * Composite FK ensures the version belongs to this template.
 */
export async function publishTemplateVersion(
  templateId: string,
  versionId: string,
  actor: TemplateActor,
  db: Database = getDb()
): Promise<TemplateJson> {
  return db.transaction(async (tx) => {
    const before = await requireTemplate(tx, templateId)

    if (before.status === "archived") {
      throw AppError.conflict([
        {
          path: "status",
          message: "Archived templates cannot be published",
        },
      ])
    }

    const [version] = await tx
      .select()
      .from(templateVersion)
      .where(
        and(
          eq(templateVersion.id, versionId),
          eq(templateVersion.templateId, templateId)
        )
      )
      .limit(1)

    if (!version) {
      throw AppError.notFound([
        { path: "version_id", message: "Version not found for this template" },
      ])
    }

    const [row] = await tx
      .update(template)
      .set({
        currentVersionId: version.id,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(template.id, templateId))
      .returning()

    if (!row) {
      throw AppError.internal()
    }

    await writeAudit(tx, {
      actor: { type: "user", id: actor.userId },
      action: "template.publish",
      objectType: "template",
      objectId: row.id,
      requestId: actor.requestId,
      before: serializeTemplate(before),
      after: serializeTemplate(row),
    })

    return serializeTemplate(row)
  })
}

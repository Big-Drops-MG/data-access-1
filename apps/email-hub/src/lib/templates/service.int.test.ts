import { randomUUID } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { emailRoute, template, templateVersion } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createCategory,
  createSender,
  createTemplate,
  createUser,
} from "@workspace/db/test"
import { AppError } from "@workspace/shared"

import {
  createTemplate as createTemplateApi,
  createTemplateVersion,
  publishTemplateVersion,
  updateTemplate,
} from "./service.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("templates service (int)", () => {
  it("creates a draft with no version; versions are immutable inserts", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const category = await createCategory(db, { createdBy: user.id })

    const created = await createTemplateApi(
      {
        name: `t048-draft-${suffix}`,
        categoryId: category.id,
        emailType: "thank_you",
      },
      { userId: user.id, requestId: `t048-create-${suffix}` },
      db
    )

    expect(created.status).toBe("draft")
    expect(created.current_version_id).toBeNull()

    const v1 = await createTemplateVersion(
      created.id,
      {
        subject: "Hi {{first_name}}",
        bodySource: "<p>Hello {{first_name}} — {{quote_url}}</p>",
      },
      { userId: user.id, requestId: `t048-v1-${suffix}` },
      db
    )

    expect(v1.version_no).toBe(1)
    expect(v1.merge_tags).toEqual({
      first_name: "string",
      quote_url: "string",
    })

    const v2 = await createTemplateVersion(
      created.id,
      {
        subject: "Updated subject",
        bodySource: "<p>v2</p>",
      },
      { userId: user.id, requestId: `t048-v2-${suffix}` },
      db
    )
    expect(v2.version_no).toBe(2)

    const [storedV1] = await db
      .select()
      .from(templateVersion)
      .where(eq(templateVersion.id, v1.id))
      .limit(1)
    expect(storedV1?.subject).toBe("Hi {{first_name}}")
  })

  it("publish switches current_version_id atomically and activates the template", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const category = await createCategory(db, { createdBy: user.id })

    const created = await createTemplateApi(
      {
        name: `t048-publish-${suffix}`,
        categoryId: category.id,
        emailType: "engagement",
      },
      { userId: user.id },
      db
    )
    const v1 = await createTemplateVersion(
      created.id,
      { subject: "v1", bodySource: "<p>v1</p>" },
      { userId: user.id },
      db
    )
    const v2 = await createTemplateVersion(
      created.id,
      { subject: "v2", bodySource: "<p>v2</p>" },
      { userId: user.id },
      db
    )

    const published = await publishTemplateVersion(
      created.id,
      v2.id,
      { userId: user.id, requestId: `t048-pub-${suffix}` },
      db
    )

    expect(published.current_version_id).toBe(v2.id)
    expect(published.status).toBe("active")

    const rolledBack = await publishTemplateVersion(
      created.id,
      v1.id,
      { userId: user.id },
      db
    )
    expect(rolledBack.current_version_id).toBe(v1.id)

    await expect(
      publishTemplateVersion(created.id, randomUUID(), { userId: user.id }, db)
    ).rejects.toMatchObject({ code: "not_found", status: 404 })
  })

  it("blocks archive when an active email_route points at the template", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const { template: tpl } = await createTemplate(db, {
      name: `t048-archive-${suffix}`,
      createdBy: user.id,
      status: "active",
      emailType: "engagement",
    })
    const sender = await createSender(db, { createdBy: user.id })

    await db
      .update(emailRoute)
      .set({ status: "inactive" })
      .where(
        and(
          eq(emailRoute.emailType, "engagement"),
          eq(emailRoute.status, "active"),
          isNull(emailRoute.offerId)
        )
      )

    const [route] = await db
      .insert(emailRoute)
      .values({
        emailType: tpl.emailType,
        templateId: tpl.id,
        senderId: sender.id,
        status: "active",
        createdBy: user.id,
      })
      .returning()

    await expect(
      updateTemplate(tpl.id, { status: "archived" }, { userId: user.id }, db)
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AppError)
      const appError = error as AppError
      expect(appError.code).toBe("conflict")
      expect(appError.status).toBe(409)
      expect(appError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "email_route",
            message: route!.id,
          }),
        ])
      )
      return true
    })

    await db
      .update(emailRoute)
      .set({ status: "inactive" })
      .where(eq(emailRoute.id, route!.id))

    const archived = await updateTemplate(
      tpl.id,
      { status: "archived" },
      { userId: user.id },
      db
    )
    expect(archived.status).toBe("archived")

    const [row] = await db
      .select()
      .from(template)
      .where(eq(template.id, tpl.id))
      .limit(1)
    expect(row?.status).toBe("archived")
  })
})

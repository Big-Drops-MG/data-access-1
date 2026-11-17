import { eq } from "drizzle-orm"

import {
  emailCategory,
  message,
  template,
  templateVersion,
} from "@workspace/db"
import { getDb } from "@workspace/db/client"

export type UnsubscribeContext = {
  categoryKey: string
  categoryName: string
}

/** Resolve the message's email category for confirm-page copy. */
export async function loadUnsubscribeContext(
  messageId: string
): Promise<UnsubscribeContext | null> {
  const db = getDb()
  const [row] = await db
    .select({
      categoryKey: emailCategory.key,
      categoryName: emailCategory.name,
    })
    .from(message)
    .innerJoin(
      templateVersion,
      eq(templateVersion.id, message.templateVersionId)
    )
    .innerJoin(template, eq(template.id, templateVersion.templateId))
    .innerJoin(emailCategory, eq(emailCategory.id, template.categoryId))
    .where(eq(message.id, messageId))
    .limit(1)

  return row ?? null
}

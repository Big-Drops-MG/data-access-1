import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { template, templateVersion } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { getContextLogger, getRequestId, maskEmail } from "@workspace/logger"
import {
  AppError,
  createEnqueueSendEmail,
  emailSchema,
  triggerEmail,
  type MergeData,
} from "@workspace/shared"

import { getSendEmailQueue } from "@/lib/ext-emails/queue"

import type { TemplateActor } from "./service"

export type TestSendTemplateInput = {
  templateId: string
  versionId: string
  offerId: string | null
  idempotencyKey?: string
  mergeData?: MergeData
  email: string
}

export type TestSendTemplateResult = {
  message_id: string
  status: "queued"
  environment: "test"
  httpStatus: 200 | 202
}

export async function sendTemplateTest(
  input: TestSendTemplateInput,
  actor: TemplateActor
): Promise<TestSendTemplateResult> {
  const email = emailSchema.safeParse(input.email)
  if (!email.success) {
    throw AppError.validationFailed([
      { path: "email", message: "Current user email is missing" },
    ])
  }

  logTestSend(actor, "template.test_send_requested", input, email.data)

  const db = getDb()
  const [row] = await db
    .select({
      id: template.id,
      emailType: template.emailType,
      status: template.status,
      versionId: templateVersion.id,
    })
    .from(template)
    .innerJoin(
      templateVersion,
      and(
        eq(templateVersion.id, input.versionId),
        eq(templateVersion.templateId, template.id)
      )
    )
    .where(eq(template.id, input.templateId))
    .limit(1)

  if (!row) {
    const [templateRow] = await db
      .select({ id: template.id })
      .from(template)
      .where(eq(template.id, input.templateId))
      .limit(1)
    if (!templateRow) {
      throw AppError.notFound([{ path: "id", message: "Template not found" }])
    }
    throw AppError.notFound([
      { path: "version_id", message: "Version not found for this template" },
    ])
  }

  if (row.status === "archived") {
    throw AppError.conflict([
      { path: "status", message: "Archived templates cannot be test-sent" },
    ])
  }

  getSendEmailQueue()

  const requestId = getRequestId() ?? actor.requestId ?? undefined
  const idempotencyKey = testIdempotencyKey(actor.userId, input.idempotencyKey)
  const result = await triggerEmail(
    db,
    {
      email: email.data,
      idempotencyKey,
      emailType: row.emailType,
      offerId: input.offerId,
      mergeData: input.mergeData,
      requestId,
      environment: "test",
      templateVersionId: row.versionId,
    },
    {
      enqueueSendEmail: createEnqueueSendEmail(getSendEmailQueue()),
    }
  )

  if (result.message.status === "skipped") {
    const reason = result.message.skipReason ?? "skipped"
    throw AppError.conflict([
      {
        path: reason === "no_route" ? "route" : "send_check",
        message: reason,
      },
    ])
  }

  if (result.message.status !== "queued") {
    throw AppError.conflict([
      { path: "status", message: result.message.status },
    ])
  }

  logTestSend(actor, "template.test_send_queued", input, email.data, {
    message_id: result.message.id,
  })

  return {
    message_id: result.message.id,
    status: "queued",
    environment: "test",
    httpStatus: result.created ? 202 : 200,
  }
}

function testIdempotencyKey(
  userId: string,
  supplied: string | undefined
): string {
  const suffix = supplied?.trim() || randomUUID()
  return `test:${userId}:${suffix}`
}

function logTestSend(
  actor: TemplateActor,
  event: "template.test_send_requested" | "template.test_send_queued",
  input: TestSendTemplateInput,
  email: string,
  extra?: Record<string, string>
): void {
  const requestId = getRequestId() ?? actor.requestId ?? undefined
  getContextLogger().info(
    {
      event,
      template_id: input.templateId,
      template_version_id: input.versionId,
      user_id: actor.userId,
      environment: "test",
      recipient: maskEmail(email),
      ...(requestId ? { request_id: requestId } : {}),
      ...extra,
    },
    event === "template.test_send_queued"
      ? "Template test send queued"
      : "Template test send requested"
  )
}

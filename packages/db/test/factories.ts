import { randomBytes } from "node:crypto"

import { and, eq } from "drizzle-orm"

import type { Database } from "../src/client.js"
import { hashNormalisedEmail } from "../src/dev-seed.js"
import {
  alert,
  domain,
  emailCategory,
  message,
  recipient,
  sender,
  template,
  templateVersion,
  user,
} from "../src/schema/index.js"
import type { Alert } from "../src/schema/alert.js"
import type { Domain } from "../src/schema/domain.js"
import type { EmailCategory } from "../src/schema/email-category.js"
import type { Message } from "../src/schema/message.js"
import type { Recipient } from "../src/schema/recipient.js"
import type { Sender } from "../src/schema/sender.js"
import type { Template, TemplateVersion } from "../src/schema/template.js"
import type { User } from "../src/schema/user.js"

export type CreateUserInput = {
  email?: string
  name?: string
  role?: User["role"]
  status?: User["status"]
}

export type CreateDomainInput = {
  name?: string
  status?: Domain["status"]
  createdBy?: string | null
}

export type CreateSenderInput = {
  domainId?: string
  fromName?: string
  fromEmail?: string
  status?: Sender["status"]
  createdBy?: string | null
}

export type CreateCategoryInput = {
  key?: string
  name?: string
  kind?: EmailCategory["kind"]
  createdBy?: string
}

export type CreateTemplateInput = {
  name?: string
  emailType?: Template["emailType"]
  status?: Template["status"]
  categoryId?: string
  createdBy?: string
  subject?: string
  bodySource?: string
}

export type CreateRecipientInput = {
  email?: string
  tier?: Recipient["tier"]
  status?: Recipient["status"]
  externalUserId?: string
}

export type CreateMessageInput = {
  recipientId?: string
  senderId?: string
  templateVersionId?: string
  emailType?: Message["emailType"]
  status?: Message["status"]
  skipReason?: Message["skipReason"]
  idempotencyKey?: string
  offerId?: string | null
}

export async function createUser(
  db: Database,
  input: CreateUserInput = {}
): Promise<User> {
  const [row] = await db
    .insert(user)
    .values({
      email: input.email ?? `factory-${token()}@example.com`,
      name: input.name ?? "Factory User",
      role: input.role ?? "admin",
      status: input.status ?? "active",
    })
    .returning()

  return required(row, "user")
}

export async function createDomain(
  db: Database,
  input: CreateDomainInput = {}
): Promise<Domain> {
  const [row] = await db
    .insert(domain)
    .values({
      name: input.name ?? `${token()}.example.com`,
      status: input.status ?? "verified",
      createdBy: input.createdBy,
    })
    .returning()

  return required(row, "domain")
}

export async function createSender(
  db: Database,
  input: CreateSenderInput = {}
): Promise<Sender> {
  const createdDomain = input.domainId
    ? undefined
    : await createDomain(db, { createdBy: input.createdBy })
  const domainId = input.domainId ?? createdDomain?.id
  if (!domainId) {
    throw new Error("Sender domain was not created.")
  }

  const [row] = await db
    .insert(sender)
    .values({
      domainId,
      fromName: input.fromName ?? "Factory",
      fromEmail:
        input.fromEmail ??
        `noreply-${token()}@${createdDomain?.name ?? "factory.example.com"}`,
      status: input.status ?? "active",
      createdBy: input.createdBy,
    })
    .returning()

  return required(row, "sender")
}

export async function createCategory(
  db: Database,
  input: CreateCategoryInput = {}
): Promise<EmailCategory> {
  const createdBy = input.createdBy ?? (await createUser(db)).id
  const [row] = await db
    .insert(emailCategory)
    .values({
      key: input.key ?? `factory_${token()}`,
      name: input.name ?? "Factory category",
      kind: input.kind ?? "transactional",
      createdBy,
    })
    .returning()

  return required(row, "category")
}

export async function createTemplate(
  db: Database,
  input: CreateTemplateInput = {}
): Promise<{ template: Template; version: TemplateVersion }> {
  const createdBy = input.createdBy ?? (await createUser(db)).id
  const categoryId =
    input.categoryId ?? (await createCategory(db, { createdBy })).id
  const emailType = input.emailType ?? "thank_you"

  const [draft] = await db
    .insert(template)
    .values({
      name: input.name ?? `Factory ${token()}`,
      emailType,
      categoryId,
      status: input.status ?? "active",
      createdBy,
    })
    .returning()
  const created = required(draft, "template")

  const [versionRow] = await db
    .insert(templateVersion)
    .values({
      templateId: created.id,
      versionNo: 1,
      subject: input.subject ?? "Factory subject",
      bodySource: input.bodySource ?? "<p>Factory body</p>",
      createdBy,
    })
    .returning()
  const version = required(versionRow, "template version")

  const [current] = await db
    .update(template)
    .set({ currentVersionId: version.id })
    .where(eq(template.id, created.id))
    .returning()

  return { template: required(current, "template"), version }
}

export async function createRecipient(
  db: Database,
  input: CreateRecipientInput = {}
): Promise<Recipient> {
  const email = input.email ?? `recipient-${token()}@example.com`
  const [row] = await db
    .insert(recipient)
    .values({
      email,
      emailHash: hashNormalisedEmail(email),
      externalUserId: input.externalUserId,
      tier: input.tier ?? "standard",
      status: input.status ?? "active",
    })
    .returning()

  return required(row, "recipient")
}

export async function createMessage(
  db: Database,
  input: CreateMessageInput = {}
): Promise<Message> {
  const recipientId = input.recipientId ?? (await createRecipient(db)).id
  const senderId = input.senderId ?? (await createSender(db)).id
  let templateVersionId = input.templateVersionId
  let emailType = input.emailType
  if (!templateVersionId) {
    const created = await createTemplate(db, { emailType })
    templateVersionId = created.version.id
    emailType = emailType ?? created.template.emailType
  }
  const status = input.status ?? "queued"

  const [row] = await db
    .insert(message)
    .values({
      recipientId,
      senderId,
      templateVersionId,
      emailType: emailType ?? "thank_you",
      idempotencyKey: input.idempotencyKey ?? `factory-${token()}`,
      status,
      skipReason:
        status === "skipped" ? (input.skipReason ?? "frequency_cap") : null,
      offerId: input.offerId,
      queuedAt: status === "queued" ? new Date() : null,
    })
    .returning()

  return required(row, "message")
}

export async function findMessage(
  db: Database,
  id: string
): Promise<Message | undefined> {
  const [row] = await db
    .select()
    .from(message)
    .where(eq(message.id, id))
    .limit(1)
  return row
}

export async function findOpenAlerts(
  db: Database,
  dedupeKey: string
): Promise<Alert[]> {
  return db
    .select()
    .from(alert)
    .where(and(eq(alert.dedupeKey, dedupeKey), eq(alert.status, "open")))
}

function token(): string {
  return randomBytes(4).toString("hex")
}

function required<T>(row: T | undefined, label: string): T {
  if (!row) {
    throw new Error(`Factory did not insert ${label}.`)
  }

  return row
}

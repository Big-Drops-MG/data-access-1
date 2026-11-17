import { and, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm"

import {
  alert,
  domain,
  emailRoute,
  feedbackItem,
  message,
  recipient,
  send,
  sender,
  template,
} from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

type Db = Database | DatabaseTransaction

/**
 * Hub list filters for the top-bar selected offer.
 * Templates/senders/domains resolve through email_route (offer-specific or default null-offer)
 * and send usage; messages drive recipient/complaint scoping; alerts match payload/dedupe.
 */
export function templateScopedToOffer(db: Db, offerId: string): SQL {
  return exists(
    db
      .select({ id: emailRoute.id })
      .from(emailRoute)
      .where(
        and(
          eq(emailRoute.templateId, template.id),
          or(eq(emailRoute.offerId, offerId), isNull(emailRoute.offerId))
        )
      )
  )
}

export function senderScopedToOffer(db: Db, offerId: string): SQL {
  return or(
    exists(
      db
        .select({ id: emailRoute.id })
        .from(emailRoute)
        .where(
          and(
            eq(emailRoute.senderId, sender.id),
            or(eq(emailRoute.offerId, offerId), isNull(emailRoute.offerId))
          )
        )
    ),
    exists(
      db
        .select({ id: send.id })
        .from(send)
        .where(and(eq(send.senderId, sender.id), eq(send.offerId, offerId)))
    )
  ) as SQL
}

export function domainScopedToOffer(db: Db, offerId: string): SQL {
  return or(
    eq(domain.offerId, offerId),
    exists(
      db
        .select({ id: sender.id })
        .from(sender)
        .innerJoin(emailRoute, eq(emailRoute.senderId, sender.id))
        .where(
          and(
            eq(sender.domainId, domain.id),
            or(eq(emailRoute.offerId, offerId), isNull(emailRoute.offerId))
          )
        )
    ),
    exists(
      db
        .select({ id: send.id })
        .from(send)
        .innerJoin(sender, eq(send.senderId, sender.id))
        .where(and(eq(sender.domainId, domain.id), eq(send.offerId, offerId)))
    )
  ) as SQL
}

export function recipientScopedToOffer(db: Db, offerId: string): SQL {
  return exists(
    db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.recipientId, recipient.id), eq(message.offerId, offerId))
      )
  )
}

export function feedbackScopedToOffer(db: Db, offerId: string): SQL {
  return or(
    exists(
      db
        .select({ id: message.id })
        .from(message)
        .where(
          and(
            eq(message.id, feedbackItem.messageId),
            eq(message.offerId, offerId)
          )
        )
    ),
    exists(
      db
        .select({ id: message.id })
        .from(message)
        .where(
          and(
            eq(message.recipientId, feedbackItem.recipientId),
            eq(message.offerId, offerId)
          )
        )
    )
  ) as SQL
}

/** Keep account-wide alerts; only drop rows tied to a different offer. */
export function alertScopedToOffer(offerId: string): SQL {
  return or(
    isNull(alert.payload),
    sql`${alert.payload}->>'offer_id' is null`,
    sql`${alert.payload}->>'offer_id' = ${offerId}`,
    sql`${alert.dedupeKey} like ${`%${offerId}%`}`
  ) as SQL
}

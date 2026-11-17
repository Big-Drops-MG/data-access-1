import { describe, expect, it } from "vitest"

import { alertListQuerySchema } from "@/lib/alerts/schemas"
import { domainListQuerySchema } from "@/lib/domains/schemas"
import { feedbackListQuerySchema } from "@/lib/feedback/schemas"
import { recipientListQuerySchema } from "@/lib/recipients/schemas"
import { senderListQuerySchema } from "@/lib/senders/schemas"
import { templateListQuerySchema } from "@/lib/templates/schemas"

const OFFER_ID = "019a0000-0000-7000-8000-0000000000aa"

describe("offer-scoped list query schemas", () => {
  it("accepts offer_id on Hub list queries", () => {
    expect(templateListQuerySchema.parse({ offer_id: OFFER_ID })).toMatchObject(
      { offer_id: OFFER_ID }
    )
    expect(senderListQuerySchema.parse({ offer_id: OFFER_ID })).toMatchObject({
      offer_id: OFFER_ID,
    })
    expect(domainListQuerySchema.parse({ offer_id: OFFER_ID })).toMatchObject({
      offer_id: OFFER_ID,
    })
    expect(alertListQuerySchema.parse({ offer_id: OFFER_ID })).toMatchObject({
      offer_id: OFFER_ID,
    })
    expect(feedbackListQuerySchema.parse({ offer_id: OFFER_ID })).toMatchObject(
      { offer_id: OFFER_ID }
    )
    expect(
      recipientListQuerySchema.parse({ offer_id: OFFER_ID })
    ).toMatchObject({ offer_id: OFFER_ID })
  })
})

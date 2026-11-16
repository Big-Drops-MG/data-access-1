import { describe, expect, it } from "vitest"

import { serializeOffer, serializeOfferListItem } from "./serialize"

const baseRow = {
  id: "019a0000-0000-7000-8000-0000000000aa",
  name: "Q4 relaunch",
  externalRef: "2049",
  everflowOfferId: 2049,
  status: "active" as const,
  approvedSubjectLines: ["Subject A"],
  approvedFromLines: ["From A"],
  trackingLinks: {
    tracking_url: "https://track.example/x",
    impression_tracking_url: null,
    redirect_tracking_url: null,
    urls: [],
  },
  creatives: [
    {
      network_offer_creative_id: 1,
      name: "CR1",
      creative_type: "html",
      creative_status: "active",
      resource_url: "",
    },
  ],
  unsubscribeUrl: "https://unsub.example/o",
  suppressionFileUrl: null,
  optizmoMailerAccessKeyEncrypted: "v1.iv.tag.cipher",
  hasOptizmoMailerAccessKey: true,
  lastSyncedAt: new Date("2026-11-05T12:00:00.000Z"),
  createdAt: new Date("2026-11-05T12:00:00.000Z"),
  updatedAt: new Date("2026-11-05T12:00:00.000Z"),
}

describe("serializeOffer", () => {
  it("maps drizzle columns to API JSON without the mailer key", () => {
    expect(serializeOffer(baseRow)).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      name: "Q4 relaunch",
      external_ref: "2049",
      everflow_offer_id: 2049,
      status: "active",
      approved_subject_lines: ["Subject A"],
      approved_from_lines: ["From A"],
      tracking_links: baseRow.trackingLinks,
      creatives: baseRow.creatives,
      unsubscribe_url: "https://unsub.example/o",
      suppression_file_url: null,
      has_optizmo_mailer_access_key: true,
      last_synced_at: "2026-11-05T12:00:00.000Z",
      created_at: "2026-11-05T12:00:00.000Z",
      updated_at: "2026-11-05T12:00:00.000Z",
    })
    expect(JSON.stringify(serializeOffer(baseRow))).not.toContain(
      "v1.iv.tag.cipher"
    )
  })
})

describe("serializeOfferListItem", () => {
  it("returns a lean list row", () => {
    expect(serializeOfferListItem(baseRow)).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      name: "Q4 relaunch",
      external_ref: "2049",
      everflow_offer_id: 2049,
      status: "active",
      has_optizmo_mailer_access_key: true,
      last_synced_at: "2026-11-05T12:00:00.000Z",
    })
  })
})

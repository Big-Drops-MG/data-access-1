import { describe, expect, it } from "vitest"

import {
  SES_BOUNCE_CRITICAL_PERCENT,
  SES_BOUNCE_WARNING_PERCENT,
  SES_COMPLAINT_CRITICAL_PERCENT,
  SES_COMPLAINT_WARNING_PERCENT,
} from "@workspace/shared"

import type { AlertJson } from "@/lib/alerts/serialize"
import type { SendJson } from "@/lib/sends/serialize"
import type { EngagementRow, SendingRow } from "@/features/dashboard/model"

import {
  BOUNCE_PAUSE_PERCENT,
  BOUNCE_WARN_PERCENT,
  COMPLAINT_PAUSE_PERCENT,
  COMPLAINT_WARN_PERCENT,
  alertHeadline,
  buildIntegrationItems,
  chartAxis,
  dashboardSends,
  formatRate,
  meterFill,
  sentPerDay,
  summarizeRange,
} from "./model"

function sending(
  partial: Partial<SendingRow> & Pick<SendingRow, "day">
): SendingRow {
  return {
    sent: 0,
    delivered: 0,
    bounce_hard: 0,
    bounce_soft: 0,
    complaint: 0,
    ...partial,
  }
}

function engagement(
  partial: Partial<EngagementRow> & Pick<EngagementRow, "day">
): EngagementRow {
  return {
    opens: 0,
    clicks: 0,
    unsubscribes: 0,
    ...partial,
  }
}

function alert(
  partial: Partial<AlertJson> & Pick<AlertJson, "type">
): AlertJson {
  return {
    id: partial.type,
    severity: "warning",
    status: "open",
    dedupe_key: null,
    payload: null,
    opened_at: "2026-11-20T12:00:00.000Z",
    resolved_at: null,
    last_triggered_at: "2026-11-20T12:00:00.000Z",
    occurrence_count: 1,
    acknowledged_by: null,
    acknowledged_at: null,
    created_at: "2026-11-20T12:00:00.000Z",
    updated_at: "2026-11-20T12:00:00.000Z",
    ...partial,
  }
}

function send(
  partial: Partial<SendJson> & Pick<SendJson, "id" | "status">
): SendJson {
  return {
    name: partial.id,
    email_type: "engagement",
    template_version_id: "tpl",
    template_name: null,
    template_version_no: null,
    sender_id: "sender",
    sender_from_name: null,
    sender_from_email: null,
    category_id: "category",
    category_name: null,
    offer_id: null,
    offer_name: null,
    offer_external_ref: null,
    scheduled_for: "2026-11-20T15:00:00.000Z",
    dispatch_started_at: null,
    completed_at: null,
    version: 1,
    created_by: "user",
    created_at: "2026-11-20T15:00:00.000Z",
    updated_at: "2026-11-20T15:00:00.000Z",
    counts: {
      total: 10,
      processed: 10,
      delivered: 9,
      sent: 10,
      queued: 0,
      soft_bounce: 0,
      hard_bounce: 0,
      skipped: 0,
      skipped_suppressed: 0,
      skipped_opted_out: 0,
      skipped_frequency_cap: 0,
    },
    activity: [],
    ...partial,
  }
}

describe("dashboard range math", () => {
  it("uses the same pause thresholds as SES health", () => {
    expect(BOUNCE_WARN_PERCENT).toBe(SES_BOUNCE_WARNING_PERCENT)
    expect(BOUNCE_PAUSE_PERCENT).toBe(SES_BOUNCE_CRITICAL_PERCENT)
    expect(COMPLAINT_WARN_PERCENT).toBe(SES_COMPLAINT_WARNING_PERCENT)
    expect(COMPLAINT_PAUSE_PERCENT).toBe(SES_COMPLAINT_CRITICAL_PERCENT)
  })

  it("rolls volume and rates up for the selected window", () => {
    const summary = summarizeRange(
      [
        sending({
          day: "2026-11-01",
          sent: 400,
          delivered: 390,
          bounce_hard: 6,
          bounce_soft: 4,
          complaint: 1,
        }),
        sending({
          day: "2026-11-02",
          sent: 212,
          delivered: 213,
          bounce_soft: 5,
        }),
      ],
      [
        engagement({
          day: "2026-11-01",
          opens: 148,
          clicks: 19,
          unsubscribes: 1,
        }),
      ]
    )

    expect(summary.sent).toBe(612)
    expect(summary.delivered).toBe(603)
    expect(summary.bounced).toBe(15)
    expect(summary.complaints).toBe(1)
    expect(formatRate(summary.bounceRate)).toBe("2.45%")
    expect(formatRate(summary.openRate)).toBe("24.5%")
    expect(summary.clickRate).not.toBeNull()
  })

  it("leaves engagement rates empty until those rows load", () => {
    const summary = summarizeRange(
      [sending({ day: "2026-11-01", sent: 10, delivered: 10 })],
      null
    )
    expect(summary.openRate).toBeNull()
    expect(summary.bounceRate).toBe(0)
  })

  it("fills every day in the window, including days with no sends", () => {
    expect(
      sentPerDay("2026-11-01", "2026-11-03", [
        sending({ day: "2026-11-01", sent: 180 }),
        sending({ day: "2026-11-01", sent: 20 }),
      ])
    ).toEqual([
      { day: "2026-11-01", label: "Nov 1", sent: 200 },
      { day: "2026-11-02", label: "Nov 2", sent: 0 },
      { day: "2026-11-03", label: "Nov 3", sent: 0 },
    ])
  })

  it("rounds the chart axis up to a readable ceiling", () => {
    expect(chartAxis(180)).toEqual({ max: 200, mid: 100 })
    expect(chartAxis(0)).toEqual({ max: 1, mid: 0 })
  })

  it("fills a rate meter against its pause threshold", () => {
    expect(meterFill(0.0147, 4)).toBeCloseTo(36.75)
    expect(meterFill(0.05, 4)).toBe(100)
    expect(meterFill(null, 4)).toBe(0)
  })
})

describe("dashboard lists", () => {
  it("prefers an alert reason over the raw type", () => {
    expect(
      alertHeadline(
        alert({
          type: "optizmo_sync_failed",
          payload: { reason: "Optizmo sync failed for OFR-2210" },
        })
      )
    ).toBe("Optizmo sync failed for OFR-2210")
    expect(alertHeadline(alert({ type: "ses_bounce_rate_critical" }))).toBe(
      "Ses bounce rate critical"
    )
  })

  it("filters sends by the schedule control and newest first", () => {
    const recent = [
      send({
        id: "old",
        status: "completed",
        completed_at: "2026-10-05T18:08:00.000Z",
      }),
      send({
        id: "newer",
        status: "completed",
        completed_at: "2026-10-15T14:05:00.000Z",
      }),
    ]
    const upcoming = [
      send({
        id: "soon",
        status: "scheduled",
        scheduled_for: "2026-11-21T15:00:00.000Z",
      }),
    ]

    expect(
      dashboardSends(recent, upcoming, "all").map((row) => row.id)
    ).toEqual(["soon", "newer", "old"])
    expect(
      dashboardSends(recent, upcoming, "completed").map((row) => row.id)
    ).toEqual(["newer", "old"])
    expect(
      dashboardSends(recent, upcoming, "upcoming").map((row) => row.id)
    ).toEqual(["soon"])
  })

  it("marks optizmo degraded from sync state and SES failed from a critical alert", () => {
    const items = buildIntegrationItems({
      integrations: [
        {
          key: "optizmo",
          status: "degraded",
          last_success_at: "2026-10-06T05:02:00.000Z",
          last_attempt_at: "2026-10-06T06:15:00.000Z",
          last_error: "Optizmo sync failed for OFR-2210",
        },
        {
          key: "google_postmaster",
          status: "healthy",
          last_success_at: "2026-10-06T12:00:00.000Z",
          last_attempt_at: "2026-10-06T12:00:00.000Z",
          last_error: null,
        },
        {
          key: "everflow",
          status: "healthy",
          last_success_at: "2026-10-06T12:00:00.000Z",
          last_attempt_at: "2026-10-06T12:00:00.000Z",
          last_error: null,
        },
      ],
      alerts: [
        alert({
          type: "ses_sending_disabled",
          severity: "critical",
          payload: { reason: "Sending is disabled" },
        }),
      ],
      analytics: "ok",
      formatWhen: () => "Oct 6, 8:00 AM ET",
    })

    expect(items.find((item) => item.id === "ses")).toMatchObject({
      label: "Failed",
      tone: "err",
      detail: "Sending is disabled",
    })
    expect(items.find((item) => item.id === "optizmo")).toMatchObject({
      label: "Degraded",
      detail: "Optizmo sync failed for OFR-2210",
    })
    expect(items.find((item) => item.id === "analytics")).toMatchObject({
      label: "Healthy",
    })
    expect(items.find((item) => item.id === "postmaster")).toMatchObject({
      label: "Healthy",
      detail: "Last success Oct 6, 8:00 AM ET",
    })
    expect(items.find((item) => item.id === "everflow")?.name).toBe("Everflow")
    expect(items.map((item) => item.id).slice(0, 6)).toEqual([
      "ses",
      "ses-webhook",
      "optizmo",
      "analytics",
      "imap",
      "postmaster",
    ])
  })
})

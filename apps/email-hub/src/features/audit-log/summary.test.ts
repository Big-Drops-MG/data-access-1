import { describe, expect, it } from "vitest"

import type { AuditLogListItem } from "@/features/audit-log/api"
import {
  actionVerb,
  auditEventSummary,
  auditPayloadEntries,
  fieldLabel,
  formatAuditValue,
  partitionAuditFields,
  payloadDisplayName,
} from "@/features/audit-log/summary"

function row(overrides: Partial<AuditLogListItem> = {}): AuditLogListItem {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
    actor_type: "user",
    actor_id: "019a0000-0000-7000-8000-000000000001",
    actor_name: "Alex Operator",
    action: "domain.create",
    object_type: "domain",
    object_id: "019a0000-0000-7000-8000-000000000002",
    before: null,
    after: { name: "mail.example.com" },
    request_id: "req-1",
    created_at: "2026-11-10T15:00:00.000Z",
    ...overrides,
  }
}

describe("audit event summary", () => {
  it("prefers payload names for the event line", () => {
    expect(payloadDisplayName({ name: "mail.example.com" })).toBe(
      "mail.example.com"
    )
    expect(actionVerb("domain.create")).toBe("Created")
    expect(auditEventSummary(row())).toBe("Created mail.example.com")
  })

  it("falls back to object type when payload has no label", () => {
    expect(
      auditEventSummary(row({ after: { status: "active" }, before: null }))
    ).toBe("Created Domain")
  })

  it("uses from_email for senders", () => {
    expect(
      auditEventSummary(
        row({
          action: "sender.create",
          object_type: "sender",
          after: { from_email: "noreply@mail.example.com" },
        })
      )
    ).toBe("Created noreply@mail.example.com")
  })
})

describe("audit payload presentation", () => {
  it("humanizes keys and values and hides empties in partitions", () => {
    expect(fieldLabel("reviewing_by")).toBe("Reviewer")
    expect(formatAuditValue("provider_fbl")).toBe("Provider FBL")
    expect(formatAuditValue(null)).toBe("—")

    const entries = auditPayloadEntries({
      status: "in_review",
      decision: null,
      recipient_id: "019a0000-0000-7000-8000-000000000099",
      source: "provider_fbl",
    })
    const { primary, technical } = partitionAuditFields(entries)

    expect(primary.map((entry) => entry.label)).toEqual(["Status", "Source"])
    expect(technical.map((entry) => entry.label)).toEqual(["Recipient"])
  })
})

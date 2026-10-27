import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { emailRoute, emailRouteStatus } from "./email-route.js"
import { emailType } from "./email-type.js"
import { frequencyRule, frequencyRuleKind } from "./frequency-rule.js"
import { message, messageSkipReason, messageStatus } from "./message.js"
import { send, sendStatus } from "./send.js"
import { template, templateStatus, templateVersion } from "./template.js"

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((entry) => entry.config.name)
}

describe("email sending tables", () => {
  it("constrains template identity and version membership", () => {
    expect(emailType.enumValues).toEqual([
      "thank_you",
      "feedback_request",
      "engagement",
    ])
    expect(templateStatus.enumValues).toEqual(["draft", "active", "archived"])
    expect(indexNames(template)).toEqual(
      expect.arrayContaining([
        "template_name_unique",
        "template_email_type_status_idx",
      ])
    )
    expect(
      getTableConfig(template).foreignKeys.map((entry) => entry.getName())
    ).toContain("template_current_version_same_template_fk")
    expect(indexNames(templateVersion)).toContain(
      "template_version_template_version_no_unique"
    )
  })

  it("keeps sends and messages tied to one template version", () => {
    expect(sendStatus.enumValues).toContain("scheduled")
    expect(getTableName(send)).toBe("send")
    expect(indexNames(send)).toContain("send_status_scheduled_for_idx")
    expect(messageStatus.enumValues).toContain("skipped")
    expect(messageSkipReason.enumValues).toContain("no_route")
    expect(indexNames(message)).toEqual(
      expect.arrayContaining([
        "message_idempotency_key_unique",
        "message_ses_message_id_unique",
        "message_recipient_type_created_at_idx",
        "message_send_status_idx",
      ])
    )
    expect(getTableConfig(message).checks.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        "message_skip_reason_check",
        "message_no_route_assets_check",
      ])
    )
  })

  it("allows one effective frequency rule and one active route", () => {
    expect(frequencyRuleKind.enumValues).toEqual(["cap", "collision"])
    expect(indexNames(frequencyRule)).toEqual(
      expect.arrayContaining([
        "frequency_rule_kind_category_unique",
        "frequency_rule_kind_global_unique",
      ])
    )
    expect(emailRouteStatus.enumValues).toEqual(["active", "inactive"])
    expect(indexNames(emailRoute)).toEqual(
      expect.arrayContaining([
        "email_route_active_offer_unique",
        "email_route_active_default_unique",
        "email_route_email_type_status_idx",
      ])
    )
  })
})

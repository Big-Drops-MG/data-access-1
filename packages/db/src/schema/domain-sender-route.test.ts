import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { domain } from "./domain.js"
import { emailRoute, emailRouteStatus } from "./email-route.js"
import { emailType } from "./email-type.js"
import { sender } from "./sender.js"
import { template, templateStatus, templateVersion } from "./template.js"

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((entry) => entry.config.name)
}

describe("domain sender route tables", () => {
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
        "template_offer_id_idx",
      ])
    )
    expect(
      getTableConfig(template).foreignKeys.map((entry) => entry.getName())
    ).toEqual(
      expect.arrayContaining([
        "template_current_version_same_template_fk",
        "template_offer_id_offer_id_fk",
      ])
    )
    expect(indexNames(templateVersion)).toContain(
      "template_version_template_version_no_unique"
    )
  })

  it("allows optional offer assignment on domain and sender", () => {
    expect(indexNames(domain)).toEqual(
      expect.arrayContaining([
        "domain_name_unique",
        "domain_status_idx",
        "domain_created_by_idx",
        "domain_offer_id_idx",
      ])
    )
    expect(
      getTableConfig(domain).foreignKeys.map((entry) => entry.getName())
    ).toContain("domain_offer_id_offer_id_fk")
    expect(indexNames(sender)).toEqual(
      expect.arrayContaining([
        "sender_from_email_unique",
        "sender_domain_id_status_idx",
        "sender_created_by_idx",
        "sender_offer_id_idx",
      ])
    )
    expect(
      getTableConfig(sender).foreignKeys.map((entry) => entry.getName())
    ).toContain("sender_offer_id_offer_id_fk")
  })

  it("keeps one active route per email type and offer", () => {
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

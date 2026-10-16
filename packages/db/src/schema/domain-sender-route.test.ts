import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { emailRoute, emailRouteStatus } from "./email-route.js"
import { emailType } from "./email-type.js"
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
      ])
    )
    expect(
      getTableConfig(template).foreignKeys.map((entry) => entry.getName())
    ).toContain("template_current_version_same_template_fk")
    expect(indexNames(templateVersion)).toContain(
      "template_version_template_version_no_unique"
    )
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

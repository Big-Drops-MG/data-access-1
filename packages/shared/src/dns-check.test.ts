import { describe, expect, it } from "vitest"

import {
  DNS_CHECK_FAILED_ALERT_TYPE,
  DOMAIN_PENDING_72H_ALERT_TYPE,
  dnsCheckFailedAlertDedupeKey,
  domainPending72hAlertDedupeKey,
} from "./dns-check.js"

const DOMAIN_ID = "019a0000-0000-7000-8000-0000000000aa"

describe("dns-check alerts", () => {
  it("uses stable dedupe keys and alert types", () => {
    expect(DNS_CHECK_FAILED_ALERT_TYPE).toBe("dns_check_failed")
    expect(DOMAIN_PENDING_72H_ALERT_TYPE).toBe("domain_pending_72h")
    expect(dnsCheckFailedAlertDedupeKey(DOMAIN_ID)).toBe(
      `dns_check_failed:${DOMAIN_ID}`
    )
    expect(domainPending72hAlertDedupeKey(DOMAIN_ID)).toBe(
      `domain_pending_72h:${DOMAIN_ID}`
    )
  })
})

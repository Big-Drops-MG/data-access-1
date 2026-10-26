import { describe, expect, it } from "vitest"

import { createTwoFactorPlugin } from "./two-factor-config"
import {
  TWO_FACTOR_BACKUP_CODE_COUNT,
  TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  TWO_FACTOR_ISSUER,
  TWO_FACTOR_LOCK_DURATION_SECONDS,
  TWO_FACTOR_MAX_FAILED_ATTEMPTS,
  TWO_FACTOR_TOTP_DIGITS,
  TWO_FACTOR_TOTP_PERIOD_SECONDS,
  TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
} from "./two-factor-policy"

describe("createTwoFactorPlugin", () => {
  it("configures TOTP, backup codes, passwordless Google, and trust device", () => {
    const plugin = createTwoFactorPlugin()
    expect(plugin.id).toBe("two-factor")
    expect(plugin.options).toMatchObject({
      issuer: TWO_FACTOR_ISSUER,
      allowPasswordless: true,
      skipVerificationOnEnable: false,
      twoFactorCookieMaxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
      trustDeviceMaxAge: TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS,
      totpOptions: {
        digits: TWO_FACTOR_TOTP_DIGITS,
        period: TWO_FACTOR_TOTP_PERIOD_SECONDS,
      },
      backupCodeOptions: {
        amount: TWO_FACTOR_BACKUP_CODE_COUNT,
        storeBackupCodes: "encrypted",
      },
      accountLockout: {
        enabled: false,
        maxFailedAttempts: TWO_FACTOR_MAX_FAILED_ATTEMPTS,
        durationSeconds: TWO_FACTOR_LOCK_DURATION_SECONDS,
      },
    })
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { IntegrationSyncState } from "@workspace/db"

import { isAppError } from "./errors.js"
import {
  INTEGRATION_DOWN_ALERT_TYPE,
  INTEGRATION_ERROR_MAX_LENGTH,
  INTEGRATION_FAILURES_TO_DOWN,
  integrationDownAlertDedupeKey,
  nextFailureState,
  normalizeIntegrationName,
  recordIntegrationResult,
  sanitizeIntegrationError,
  statusAfterConsecutiveFailures,
} from "./integration-sync-state.js"

const openAlert = vi.hoisted(() => vi.fn())
const closeAlert = vi.hoisted(() => vi.fn())

vi.mock("./alerts.js", () => ({
  openAlert,
  closeAlert,
}))

const at = new Date("2026-11-16T15:00:00.000Z")

function syncRow(
  overrides: Partial<IntegrationSyncState> = {}
): IntegrationSyncState {
  return {
    key: "optizmo",
    lastSuccessAt: null,
    lastAttemptAt: at,
    status: "healthy",
    lastError: null,
    consecutiveFailures: 0,
    updatedAt: at,
    ...overrides,
  }
}

type Store = {
  row: IntegrationSyncState | undefined
}

function createDb(store: Store) {
  const execute = vi.fn(async () => undefined)
  const tx = {
    execute,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (store.row ? [store.row] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Partial<IntegrationSyncState>) => ({
        onConflictDoUpdate: (args: { set: Partial<IntegrationSyncState> }) => ({
          returning: async () => {
            if (!store.row) {
              store.row = syncRow({
                key: String(values.key),
                lastSuccessAt: (values.lastSuccessAt as Date | null) ?? null,
                lastAttemptAt: (values.lastAttemptAt as Date | null) ?? null,
                status: values.status as IntegrationSyncState["status"],
                lastError: (values.lastError as string | null) ?? null,
                consecutiveFailures: Number(values.consecutiveFailures ?? 0),
                updatedAt: (values.updatedAt as Date) ?? at,
              })
              return [store.row]
            }
            store.row = {
              ...store.row,
              ...args.set,
              key: store.row.key,
            }
            return [store.row]
          },
        }),
      }),
    }),
  }

  return {
    execute,
    transaction: async <T>(fn: (inner: typeof tx) => Promise<T>) => fn(tx),
  }
}

describe("normalizeIntegrationName", () => {
  it("trims and lowercases a valid name", () => {
    expect(normalizeIntegrationName(" Optizmo ")).toBe("optizmo")
  })

  it("rejects empty or unsafe names", () => {
    const names = ["", " ", "1bad", "Bad Name", "x".repeat(129)]
    const results = names.map((name) => {
      try {
        return normalizeIntegrationName(name)
      } catch (error) {
        return error
      }
    })
    expect(results.every((error) => isAppError(error))).toBe(true)
    expect(
      results.every(
        (error) => isAppError(error) && error.code === "validation_failed"
      )
    ).toBe(true)
  })
})

describe("sanitizeIntegrationError", () => {
  it("returns null for blank input", () => {
    expect(sanitizeIntegrationError(undefined)).toBeNull()
    expect(sanitizeIntegrationError(null)).toBeNull()
    expect(sanitizeIntegrationError("  ")).toBeNull()
  })

  it("masks emails, credentials, and truncates long errors", () => {
    expect(sanitizeIntegrationError("failed for user@example.com")).toBe(
      "failed for us***@example.com"
    )
    expect(
      sanitizeIntegrationError("upstream password=super-secret token:abc123")
    ).toBe("upstream password=[REDACTED] token=[REDACTED]")
    expect(
      sanitizeIntegrationError("auth Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")
    ).toBe("auth Bearer [REDACTED]")
    expect(
      sanitizeIntegrationError(
        "postgres://emailhub:secret@postgres:5432/emailhub?sslmode=disable"
      )
    ).toBe(
      "postgres://[REDACTED]:[REDACTED]@postgres:5432/emailhub?sslmode=disable"
    )
    expect(
      sanitizeIntegrationError("denied key=AKIAIOSFODNN7EXAMPLE")
    ).toContain("[REDACTED]")

    const long = `err-${"a".repeat(INTEGRATION_ERROR_MAX_LENGTH + 50)}`
    expect(sanitizeIntegrationError(long)?.length).toBe(
      INTEGRATION_ERROR_MAX_LENGTH
    )
  })
})

describe("statusAfterConsecutiveFailures", () => {
  it("maps zero, under-threshold, and threshold failures", () => {
    expect(statusAfterConsecutiveFailures(0)).toBe("healthy")
    expect(statusAfterConsecutiveFailures(1)).toBe("degraded")
    expect(statusAfterConsecutiveFailures(2)).toBe("degraded")
    expect(statusAfterConsecutiveFailures(INTEGRATION_FAILURES_TO_DOWN)).toBe(
      "failed"
    )
    expect(
      statusAfterConsecutiveFailures(INTEGRATION_FAILURES_TO_DOWN + 2)
    ).toBe("failed")
  })
})

describe("nextFailureState", () => {
  it("advances healthy to degraded on the first failure", () => {
    expect(nextFailureState(0)).toEqual({
      consecutiveFailures: 1,
      status: "degraded",
    })
  })

  it("keeps degraded until the third consecutive failure", () => {
    expect(nextFailureState(1)).toEqual({
      consecutiveFailures: 2,
      status: "degraded",
    })
    expect(nextFailureState(2)).toEqual({
      consecutiveFailures: 3,
      status: "failed",
    })
  })
})

describe("integrationDownAlertDedupeKey", () => {
  it("uses the SD#15.5 integration:{name} form", () => {
    expect(integrationDownAlertDedupeKey("SES_SNS")).toBe("integration:ses_sns")
  })
})

describe("recordIntegrationResult", () => {
  beforeEach(() => {
    openAlert.mockReset()
    closeAlert.mockReset()
    closeAlert.mockResolvedValue({ alert: null, closed: false })
    openAlert.mockResolvedValue({
      alert: { id: "alert-1" },
      created: true,
    })
  })

  it("records success as healthy and closes an open down alert", async () => {
    const store: Store = {
      row: syncRow({
        status: "failed",
        consecutiveFailures: 4,
        lastError: "timeout",
      }),
    }
    const db = createDb(store)
    closeAlert.mockResolvedValue({ alert: { id: "alert-1" }, closed: true })

    const result = await recordIntegrationResult(
      db as never,
      "optizmo",
      true,
      "ignored-on-success",
      at
    )

    expect(result.state).toEqual(
      expect.objectContaining({
        key: "optizmo",
        status: "healthy",
        consecutiveFailures: 0,
        lastError: null,
        lastSuccessAt: at,
        lastAttemptAt: at,
      })
    )
    expect(result.closedDownAlert).toBe(true)
    expect(result.openedDownAlert).toBe(false)
    expect(closeAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: INTEGRATION_DOWN_ALERT_TYPE,
        dedupeKey: "integration:optizmo",
        now: at,
      })
    )
    expect(openAlert).not.toHaveBeenCalled()
  })

  it("marks the first failure degraded without opening an alert", async () => {
    const store: Store = { row: undefined }
    const db = createDb(store)

    const result = await recordIntegrationResult(db as never, {
      name: "arohaa_webhook",
      ok: false,
      error: "connect reset for admin@example.com",
      now: at,
    })

    expect(result.state).toEqual(
      expect.objectContaining({
        key: "arohaa_webhook",
        status: "degraded",
        consecutiveFailures: 1,
        lastError: "connect reset for ad***@example.com",
      })
    )
    expect(result.openedDownAlert).toBe(false)
    expect(openAlert).not.toHaveBeenCalled()
  })

  it("opens integration_down on the third consecutive failure", async () => {
    const store: Store = {
      row: syncRow({
        status: "degraded",
        consecutiveFailures: 2,
        lastError: "first",
      }),
    }
    const db = createDb(store)

    const result = await recordIntegrationResult(
      db as never,
      "optizmo",
      false,
      "still down",
      at
    )

    expect(result.state.status).toBe("failed")
    expect(result.state.consecutiveFailures).toBe(3)
    expect(result.openedDownAlert).toBe(true)
    expect(openAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: INTEGRATION_DOWN_ALERT_TYPE,
        severity: "critical",
        dedupeKey: "integration:optizmo",
        refreshPayload: true,
        payload: {
          integration: "optizmo",
          consecutive_failures: 3,
          last_error: "still down",
        },
      })
    )
  })

  it("keeps failed status and refreshes the alert after further failures", async () => {
    const store: Store = {
      row: syncRow({
        status: "failed",
        consecutiveFailures: 3,
        lastError: "old",
      }),
    }
    const db = createDb(store)
    openAlert.mockResolvedValue({
      alert: { id: "alert-1" },
      created: false,
    })

    const result = await recordIntegrationResult(
      db as never,
      "optizmo",
      false,
      "again",
      at
    )

    expect(result.state.status).toBe("failed")
    expect(result.state.consecutiveFailures).toBe(4)
    expect(result.openedDownAlert).toBe(false)
    expect(openAlert).toHaveBeenCalledTimes(1)
  })

  it("uses a default error when failure details are missing", async () => {
    const store: Store = { row: undefined }
    const db = createDb(store)

    const result = await recordIntegrationResult(
      db as never,
      "ses_sns",
      false,
      null,
      at
    )

    expect(result.state.lastError).toBe("integration failed")
    expect(result.state.status).toBe("degraded")
  })

  it("rejects a non-boolean ok flag", async () => {
    const db = createDb({ row: undefined })
    await expect(
      recordIntegrationResult(db as never, {
        name: "optizmo",
        ok: "yes" as never,
      })
    ).rejects.toMatchObject({ code: "validation_failed" })
  })
})

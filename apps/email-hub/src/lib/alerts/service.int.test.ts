import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { alert, auditLog } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createUser } from "@workspace/db/test"
import { closeAlert, closeSendLateAlert, openAlert } from "@workspace/shared"

import { acknowledgeAlert, listAlerts } from "./service.js"

function isolatedCloneDatabase(): boolean {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) {
    return false
  }
  try {
    const url = new URL(raw)
    const host = url.hostname
    const loopback =
      host === "127.0.0.1" || host === "localhost" || host === "::1"
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""))
    return loopback && name.startsWith("eh_w_")
  } catch {
    return false
  }
}

describe.skipIf(!isolatedCloneDatabase())(
  "alert service (isolated clone)",
  () => {
    it("dedupes concurrent opens, filters the list, and reopens after close", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const sharedKey = `t083:${suffix}`
      const otherKey = `t083-other:${suffix}`

      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          openAlert(db, {
            type: "worker_failed",
            severity: "warning",
            dedupeKey: sharedKey,
          })
        )
      )
      const created = results.filter((result) => result.created)
      expect(created).toHaveLength(1)
      const openId = created[0]?.alert.id
      expect(new Set(results.map((result) => result.alert.id)).size).toBe(1)

      const changed = await openAlert(db, {
        type: "queue_stalled",
        severity: "critical",
        dedupeKey: sharedKey,
      })
      expect(changed.created).toBe(false)
      expect(changed.alert.id).toBe(openId)
      expect(changed.alert.type).toBe("worker_failed")
      expect(changed.alert.severity).toBe("warning")
      expect(changed.alert.occurrenceCount).toBeGreaterThan(1)

      const other = await openAlert(db, {
        type: "queue_stalled",
        severity: "info",
        dedupeKey: otherKey,
      })
      expect(other.created).toBe(true)
      expect(other.alert.id).not.toBe(openId)

      const rows = await db
        .select()
        .from(alert)
        .where(eq(alert.dedupeKey, sharedKey))
      expect(rows.filter((row) => row.status === "open")).toHaveLength(1)

      const newest = await listAlerts(
        { limit: 1, type: "queue_stalled", status: "open" },
        db
      )
      expect(newest.data.map((row) => row.id)).toEqual([other.alert.id])
      expect(newest.next_cursor).toBeNull()

      const warningPage = await listAlerts(
        {
          limit: 10,
          severity: "warning",
          status: "open",
          type: "worker_failed",
        },
        db
      )
      expect(warningPage.data.some((row) => row.id === openId)).toBe(true)
      expect(warningPage.data.some((row) => row.id === other.alert.id)).toBe(
        false
      )

      const operator = await createUser(db, { role: "operator" })
      const admin = await createUser(db, { role: "admin" })
      const [firstAck, secondAck] = await Promise.all([
        acknowledgeAlert(
          openId ?? "",
          { userId: operator.id, requestId: "a" },
          db
        ),
        acknowledgeAlert(
          openId ?? "",
          { userId: admin.id, requestId: "b" },
          db
        ),
      ])
      expect(firstAck.acknowledged_by).toBe(secondAck.acknowledged_by)
      expect(firstAck.status).toBe("open")
      expect(firstAck.resolved_at).toBeNull()

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, openId ?? ""))
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        action: "alert.acknowledged",
        entityType: "alert",
        actorId: firstAck.acknowledged_by,
        actorType: "user",
      })

      const repeated = await acknowledgeAlert(
        openId ?? "",
        { userId: admin.id, requestId: "again" },
        db
      )
      expect(repeated.acknowledged_by).toBe(firstAck.acknowledged_by)
      const auditsAfter = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, openId ?? ""))
      expect(auditsAfter).toHaveLength(1)

      const closed = await closeAlert(db, {
        type: "worker_failed",
        dedupeKey: sharedKey,
      })
      expect(closed.closed).toBe(true)
      expect(closed.alert?.status).toBe("resolved")
      expect(closed.alert?.resolvedAt).toBeInstanceOf(Date)
      expect(closed.alert?.acknowledgedBy).toBe(firstAck.acknowledged_by)

      const again = await closeAlert(db, {
        type: "worker_failed",
        dedupeKey: sharedKey,
      })
      expect(again.closed).toBe(false)
      expect(again.alert?.id).toBe(openId)
      expect(again.alert?.acknowledgedBy).toBe(firstAck.acknowledged_by)

      const unrelated = await db
        .select()
        .from(alert)
        .where(eq(alert.id, other.alert.id))
      expect(unrelated[0]?.status).toBe("open")

      const reopened = await openAlert(db, {
        type: "worker_failed",
        severity: "critical",
        dedupeKey: sharedKey,
      })
      expect(reopened.created).toBe(true)
      expect(reopened.alert.id).not.toBe(openId)
      expect(reopened.alert.severity).toBe("critical")
      expect(reopened.alert.status).toBe("open")

      const resolvedPage = await listAlerts(
        { limit: 10, status: "resolved", type: "worker_failed" },
        db
      )
      expect(resolvedPage.data.some((row) => row.id === openId)).toBe(true)
      const ordered = resolvedPage.data.map((row) => row.id)
      const sorted = [...ordered].sort((left, right) =>
        left < right ? 1 : left > right ? -1 : 0
      )
      expect(ordered).toEqual(sorted)
    })

    it("rolls back an acknowledgment when the audit actor is invalid", async () => {
      const db = getDb()
      const key = `t083-audit:${randomUUID()}`
      const opened = await openAlert(db, {
        type: "worker_failed",
        severity: "info",
        dedupeKey: key,
      })

      await expect(
        acknowledgeAlert(opened.alert.id, { userId: "not-a-uuid" }, db)
      ).rejects.toMatchObject({ code: "validation_failed" })

      const [row] = await db
        .select()
        .from(alert)
        .where(eq(alert.id, opened.alert.id))
      expect(row?.acknowledgedBy).toBeNull()
      expect(row?.acknowledgedAt).toBeNull()
      expect(row?.status).toBe("open")

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, opened.alert.id))
      expect(audits).toHaveLength(0)
    })

    it("closes only the matching send_late alert", async () => {
      const db = getDb()
      const sendId = "019a0000-0000-7000-8000-000000000501"
      const late = await openAlert(db, {
        type: "send_late",
        severity: "warning",
        dedupeKey: `send_late:${sendId}`,
        payload: { send_id: sendId },
      })
      const other = await openAlert(db, {
        type: "send_late",
        severity: "warning",
        dedupeKey: `send_late:${randomUUID()}`,
      })

      const closed = await closeSendLateAlert(db, sendId)
      expect(closed.closed).toBe(true)
      expect(closed.alert?.id).toBe(late.alert.id)

      const [stillOpen] = await db
        .select()
        .from(alert)
        .where(eq(alert.id, other.alert.id))
      expect(stillOpen?.status).toBe("open")
    })

    it("returns 404 for a missing acknowledgment", async () => {
      const db = getDb()
      const user = await createUser(db, { role: "operator" })
      await expect(
        acknowledgeAlert(
          "019a0000-0000-7000-8000-0000000000ff",
          { userId: user.id },
          db
        )
      ).rejects.toMatchObject({ code: "not_found" })
    })
  }
)

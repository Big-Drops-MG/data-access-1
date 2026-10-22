import { getTableColumns } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { recipient } from "./recipient.js"
import { seedAccount } from "./seed-account.js"
import { sender } from "./sender.js"
import { suppressionEntry } from "./suppression-entry.js"
import { user } from "./user.js"

describe("SD#5 column conventions", () => {
  it("uses citext for email columns", () => {
    expect(getTableColumns(user).email.getSQLType()).toBe("citext")
    expect(getTableColumns(recipient).email.getSQLType()).toBe("citext")
    expect(getTableColumns(sender).fromEmail.getSQLType()).toBe("citext")
    expect(getTableColumns(sender).replyTo.getSQLType()).toBe("citext")
    expect(getTableColumns(seedAccount).address.getSQLType()).toBe("citext")
  })

  it("defaults uuid primary keys with uuidv7()", () => {
    expect(JSON.stringify(getTableColumns(user).id.default)).toContain("uuidv7")
  })

  it("restricts sender domain and suppression offer deletes", () => {
    const senderDomainFk = getTableConfig(sender).foreignKeys.find((fk) =>
      fk.getName().includes("domain_id")
    )
    expect(senderDomainFk?.onDelete).toBe("restrict")

    const suppressionOfferFk = getTableConfig(
      suppressionEntry
    ).foreignKeys.find((fk) => fk.getName().includes("offer_id"))
    expect(suppressionOfferFk?.onDelete).toBe("restrict")
  })
})

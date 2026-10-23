import { describe, expect, it } from "vitest"

import {
  orderMigrationStatements,
  readPostgresMigrations,
} from "./postgres-migrate.js"

describe("postgres migrations", () => {
  it("moves the template version foreign key until after its unique index", () => {
    const ordered = orderMigrationStatements([
      'ALTER TABLE "template" ADD CONSTRAINT "template_current_version_same_template_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."template_version"("id","template_id");',
      'CREATE UNIQUE INDEX "template_version_id_template_unique" ON "template_version" ("id","template_id");',
      'CREATE INDEX "template_name_unique" ON "template" ("name");',
    ])

    expect(ordered[0]).toContain("template_version_id_template_unique")
    expect(ordered[1]).toContain("template_current_version_same_template_fk")
    expect(ordered[2]).toContain("template_name_unique")
  })

  it("leaves a migration alone when the unique index already comes first", () => {
    const statements = [
      'CREATE UNIQUE INDEX "template_version_id_template_unique" ON "template_version" ("id","template_id");',
      'ALTER TABLE "template" ADD CONSTRAINT "template_current_version_same_template_fk" FOREIGN KEY ("current_version_id","id") REFERENCES "public"."template_version"("id","template_id");',
    ]

    expect(orderMigrationStatements(statements)).toEqual(statements)
  })

  it("orders the shipped domain migration so a new database can apply it", () => {
    const migration = readPostgresMigrations().find(
      (entry) => entry.tag === "0002_domains_senders_routes"
    )
    if (!migration) {
      throw new Error("Missing 0002_domains_senders_routes.")
    }

    const ordered = orderMigrationStatements(migration.statements)
    const foreignKey = ordered.findIndex((statement) =>
      statement.includes("template_current_version_same_template_fk")
    )
    const uniqueIndex = ordered.findIndex((statement) =>
      statement.includes("template_version_id_template_unique")
    )

    expect(uniqueIndex).toBeGreaterThanOrEqual(0)
    expect(foreignKey).toBeGreaterThan(uniqueIndex)
    expect(migration.hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

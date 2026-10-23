import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import {
  createMigratedTemplate,
  dropMigratedTemplate,
  forgetTestDatabaseRun,
  loopbackTestDatabase,
  reapOrphanedTestDatabases,
  rememberTestDatabaseRun,
  resolveTestDatabaseUrls,
} from "../src/test-database.js"
import { assertDistinctWorkerDatabases } from "./worker-manifest.js"

declare module "vitest" {
  interface ProvidedContext {
    emailhubTemplateDatabase: string
    emailhubWorkerManifest: string
  }
}

let open:
  | {
      migrationUrl: string
      templateName: string
      manifestPath: string
    }
  | undefined

export async function setup(project: {
  provide: (
    key: "emailhubTemplateDatabase" | "emailhubWorkerManifest",
    value: string
  ) => void
}): Promise<void> {
  const urls = resolveTestDatabaseUrls()
  if (!urls || !loopbackTestDatabase(urls.migrationUrl)) {
    project.provide("emailhubTemplateDatabase", "")
    project.provide("emailhubWorkerManifest", "")
    return
  }

  await reapOrphanedTestDatabases(urls.migrationUrl)
  const template = await createMigratedTemplate(urls)
  const manifestPath = path.join(
    os.tmpdir(),
    `emailhub-workers-${template.name}`
  )
  rememberTestDatabaseRun(template.name)
  open = {
    migrationUrl: urls.migrationUrl,
    templateName: template.name,
    manifestPath,
  }
  project.provide("emailhubTemplateDatabase", template.name)
  project.provide("emailhubWorkerManifest", manifestPath)
}

export async function teardown(): Promise<void> {
  if (!open) {
    return
  }

  const current = open
  open = undefined
  let failure: unknown
  try {
    assertDistinctWorkerDatabases(current.manifestPath)
  } catch (error) {
    failure = error
  }

  try {
    await dropMigratedTemplate(current)
  } finally {
    forgetTestDatabaseRun(current.templateName)
    fs.rmSync(current.manifestPath, { recursive: true, force: true })
  }

  if (failure) {
    throw failure
  }
}

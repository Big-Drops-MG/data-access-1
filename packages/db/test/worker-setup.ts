import { inject } from "vitest"

import {
  cloneMigratedTemplate,
  rememberTestDatabaseUrls,
  resolveTestDatabaseUrls,
} from "../src/test-database.js"

declare module "vitest" {
  interface ProvidedContext {
    emailhubTemplateDatabase: string
  }
}

const templateName = inject("emailhubTemplateDatabase")
const globals = globalThis as typeof globalThis & {
  __emailhubWorkerDatabase?: Promise<void>
}

if (templateName) {
  globals.__emailhubWorkerDatabase ??= assignWorkerDatabase(templateName).catch(
    (error: unknown) => {
      delete globals.__emailhubWorkerDatabase
      throw error
    }
  )
  await globals.__emailhubWorkerDatabase
}

async function assignWorkerDatabase(template: string): Promise<void> {
  const urls = resolveTestDatabaseUrls()
  if (!urls) {
    throw new Error(
      "The migrated template database was created without DATABASE_URL."
    )
  }

  const clone = await cloneMigratedTemplate({
    migrationUrl: urls.migrationUrl,
    applicationUrl: urls.applicationUrl,
    templateName: template,
    workerId: "worker",
  })
  rememberTestDatabaseUrls(urls)
  process.env.DATABASE_URL = clone.applicationUrl
}

import { Client } from "pg"

import {
  APPLICATION_ROLE_NAME,
  databaseUrlIdentity,
  sslForApplicationUrl,
  sslForDatabaseUrl,
} from "./connection-policy.js"
import { loadDatabaseEnv } from "./database-env.js"
import {
  applyAppRole,
  assertAppRolePrivileges,
  sqlClientFromPg,
} from "./app-role.js"

const { applicationUrl, migrationUrl } = loadDatabaseEnv()
const application = databaseUrlIdentity(applicationUrl)

const admin = new Client({
  connectionString: migrationUrl,
  ...sslConfig(sslForDatabaseUrl(migrationUrl)),
})

await admin.connect()
try {
  await applyAppRole(sqlClientFromPg(admin), {
    password: application.password,
    databaseName: application.database,
  })
} finally {
  await admin.end()
}

const app = new Client({
  connectionString: applicationUrl,
  ...sslConfig(sslForApplicationUrl(applicationUrl)),
})

await app.connect()
try {
  await assertAppRolePrivileges(sqlClientFromPg(app))
} finally {
  await app.end()
}

process.stdout.write(
  `Application role ${APPLICATION_ROLE_NAME} can insert and select audit_log only.\n`
)

function sslConfig(ssl: { rejectUnauthorized: true } | undefined): {
  ssl?: { rejectUnauthorized: true }
} {
  return ssl ? { ssl } : {}
}

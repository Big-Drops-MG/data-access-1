/**
 * Smoke-test Hub FBL webhook for Dev and/or Prod.
 *
 * Usage:
 *   node scripts/smoke-hub.mjs
 *   node scripts/smoke-hub.mjs --env=dev
 *   node scripts/smoke-hub.mjs --env=production
 *
 * Reads FBL_WEBHOOK_SECRET from apps/email-hub/.env or process env.
 */
import { readFileSync } from "node:fs"
import process from "node:process"
import { resolve } from "node:path"

const fetchFn = globalThis.fetch

const HUBS = {
  dev: "https://emailhub-dev.dataaccess1.net",
  production: "https://emailhub.dataaccess1.net",
}

function loadSecret() {
  if (process.env.FBL_WEBHOOK_SECRET?.trim()) {
    return process.env.FBL_WEBHOOK_SECRET.trim()
  }
  const envPath = resolve(import.meta.dirname, "../../../apps/email-hub/.env")
  const text = readFileSync(envPath, "utf8")
  const line = text
    .split(/\r?\n/)
    .find((l) => l.startsWith("FBL_WEBHOOK_SECRET="))
  if (!line) {
    throw new Error(
      "FBL_WEBHOOK_SECRET not found in env or apps/email-hub/.env"
    )
  }
  return line.slice("FBL_WEBHOOK_SECRET=".length).trim()
}

function pickTargets(argv) {
  const flag = argv.find((a) => a.startsWith("--env="))
  if (!flag) {
    return Object.entries(HUBS)
  }
  const key = flag.slice("--env=".length)
  if (!(key in HUBS)) {
    throw new Error(`Unknown --env=${key} (use dev|production)`)
  }
  return [[key, HUBS[key]]]
}

async function probe(name, base, secret) {
  const url = `${base}/api/ext/webhooks/fbl`
  const noAuth = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  })
  const withAuth = await fetchFn(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      from: "smoke@example.com",
      to: "complaint@fbl.dataaccess1.net",
      raw: "Subject: smoke\r\n\r\nnot-arf",
    }),
  })
  const body = await withAuth.text().catch(() => "")
  return {
    name,
    base,
    noAuth: noAuth.status,
    withAuth: withAuth.status,
    withAuthBody: body.slice(0, 180),
    ok:
      noAuth.status === 401 &&
      (withAuth.status === 200 || withAuth.status === 400),
  }
}

const secret = loadSecret()
const targets = pickTargets(process.argv.slice(2))
const results = []
for (const [name, base] of targets) {
  results.push(await probe(name, base, secret))
}
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
const failed = results.filter((r) => !r.ok)
if (failed.length) {
  process.stderr.write(
    `FAIL: expected noAuth=401 and withAuth=200|400 (route live). Got: ${failed
      .map((r) => `${r.name} noAuth=${r.noAuth} withAuth=${r.withAuth}`)
      .join(", ")}\n`
  )
  process.exit(1)
}
process.stdout.write("PASS\n")

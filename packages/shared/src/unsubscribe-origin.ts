import { unsubscribeSettings } from "@workspace/db"
import type { Database, DatabaseTransaction } from "@workspace/db/client"

type OriginDb = Database | DatabaseTransaction

/**
 * Prefer a verified unsubscribe custom domain; otherwise the Hub fallback origin
 * (typically `BETTER_AUTH_URL`). Safe when the settings row is missing.
 */
export async function resolveUnsubscribeOrigin(
  db: OriginDb,
  fallbackOrigin: string
): Promise<string> {
  const fallback = fallbackOrigin.trim().replace(/\/+$/, "")
  try {
    const [row] = await db.select().from(unsubscribeSettings).limit(1)
    const domain = row?.customDomain?.trim().toLowerCase() ?? ""
    if (row?.customDomainStatus === "verified" && domain !== "") {
      return `https://${domain}`
    }
  } catch {
    // Settings table may not exist yet during migrate; fall back.
  }
  return fallback
}

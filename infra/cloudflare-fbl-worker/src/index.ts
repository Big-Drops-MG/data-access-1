export interface Env {
  /** Hub origin, e.g. https://emailhub-dev.dataaccess1.net */
  HUB_BASE_URL: string
  /** Shared secret; must match that Hub's FBL_WEBHOOK_SECRET */
  FBL_WEBHOOK_SECRET: string
}

type IncomingEmail = {
  from: string
  to: string
  raw: ReadableStream
}

function requireEnv(env: Env): { hubBaseUrl: string; secret: string } {
  const hubBaseUrl = env.HUB_BASE_URL?.trim().replace(/\/$/, "") ?? ""
  const secret = env.FBL_WEBHOOK_SECRET?.trim() ?? ""
  if (!hubBaseUrl) {
    throw new Error("HUB_BASE_URL is not configured")
  }
  if (!secret) {
    throw new Error("FBL_WEBHOOK_SECRET is not configured")
  }
  return { hubBaseUrl, secret }
}

/**
 * Cloudflare Email Routing → this Worker → Hub /api/ext/webhooks/fbl
 *
 * Deploy with Wrangler envs (not NODE_ENV):
 *   --env dev         → emailhub-fbl-intake-dev         → emailhub-dev.dataaccess1.net
 *   --env production  → emailhub-fbl-intake-production  → emailhub.dataaccess1.net
 */
export default {
  async email(message: IncomingEmail, env: Env): Promise<void> {
    const { hubBaseUrl, secret } = requireEnv(env)
    const raw = await new Response(message.raw).text()
    const response = await fetch(`${hubBaseUrl}/api/ext/webhooks/fbl`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        raw,
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(
        `Hub FBL webhook failed: ${response.status} ${text.slice(0, 200)}`
      )
    }
  },
}

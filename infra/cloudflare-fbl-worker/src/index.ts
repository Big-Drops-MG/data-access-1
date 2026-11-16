export interface Env {
  /** Hub base URL, e.g. https://emailhub.example.com */
  HUB_BASE_URL: string
  /** Shared secret; must match Hub FBL_WEBHOOK_SECRET */
  FBL_WEBHOOK_SECRET: string
}

type IncomingEmail = {
  from: string
  to: string
  raw: ReadableStream
}

/**
 * Cloudflare Email Routing → this Worker → Hub /api/ext/webhooks/fbl
 * Bind route: complaint@fbl.dataaccess1.net
 */
export default {
  async email(message: IncomingEmail, env: Env): Promise<void> {
    const raw = await new Response(message.raw).text()
    const base = env.HUB_BASE_URL.replace(/\/$/, "")
    const response = await fetch(`${base}/api/ext/webhooks/fbl`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.FBL_WEBHOOK_SECRET}`,
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

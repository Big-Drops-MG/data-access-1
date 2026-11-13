# Cloudflare FBL intake worker

Receives ARF/DSN mail for `complaint@fbl.dataaccess1.net` via Cloudflare Email Routing and POSTs raw MIME to Email Hub.

## Setup

1. Enable Email Routing on `fbl.dataaccess1.net` (or the parent zone that owns that mailbox).
2. Create routing rule: `complaint@fbl.dataaccess1.net` → this Worker.
3. Set Worker secrets/vars:
   - `HUB_BASE_URL` — Hub origin
   - `FBL_WEBHOOK_SECRET` — same value as Hub `FBL_WEBHOOK_SECRET`
4. Register the same address with Google / Microsoft JMRP / Yahoo FBL programs.
5. Deploy: `pnpm deploy` (from this folder) or `npx wrangler deploy`.

SES complaint events still use SNS → `/api/ext/webhooks/ses`.

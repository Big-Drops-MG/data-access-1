# Cloudflare FBL intake worker

Receives ARF/DSN mail via Cloudflare Email Routing and POSTs raw MIME to Email Hub
`POST /api/ext/webhooks/fbl`.

Do **not** switch Hub URL with `NODE_ENV`. Cloudflare Workers do not get a reliable
Node-style `NODE_ENV`, and one mailbox can only send to one Worker. Use Wrangler
environments instead (separate Worker scripts + vars).

| Env          | Worker name                      | `HUB_BASE_URL`                         | Typical mailbox                     |
| ------------ | -------------------------------- | -------------------------------------- | ----------------------------------- |
| `dev`        | `emailhub-fbl-intake-dev`        | `https://emailhub-dev.dataaccess1.net` | `complaint-dev@fbl.dataaccess1.net` |
| `production` | `emailhub-fbl-intake-production` | `https://emailhub.dataaccess1.net`     | `complaint@fbl.dataaccess1.net`     |

## Setup

1. Enable Email Routing on `fbl.dataaccess1.net` (subdomain OK; keep apex MX if needed).
2. Deploy both envs and set secrets (must match that Hub’s `FBL_WEBHOOK_SECRET`):

```powershell
cd infra/cloudflare-fbl-worker
npx wrangler deploy --env dev
npx wrangler secret put FBL_WEBHOOK_SECRET --env dev

npx wrangler deploy --env production
npx wrangler secret put FBL_WEBHOOK_SECRET --env production
```

3. Routing rules:
   - Dev tests: `complaint-dev@fbl.dataaccess1.net` → Worker `emailhub-fbl-intake-dev`
   - Real FBL (Google / Microsoft JMRP / Yahoo): `complaint@fbl.dataaccess1.net` → Worker `emailhub-fbl-intake-production`
4. On each Hub (Coolify Dev / Prod), set the matching `FBL_WEBHOOK_SECRET` and redeploy so `/api/ext/webhooks/fbl` exists.

SES complaint events still use SNS → `/api/ext/webhooks/ses`.

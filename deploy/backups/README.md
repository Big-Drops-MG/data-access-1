# Nightly Postgres and ClickHouse backups (T-105 / SD#13.8)

Host scripts that dump Postgres and ClickHouse, encrypt with `age`, upload to **Hetzner Object Storage** (S3-compatible), prune old objects, and take a weekly Hetzner Cloud server snapshot.

| Job                        | Local time (America/New_York) | Retention             |
| -------------------------- | ----------------------------- | --------------------- |
| `run-postgres-backup.sh`   | 02:00 daily                   | 30 daily + 12 monthly |
| `run-clickhouse-backup.sh` | 02:30 daily                   | 14 daily              |
| `run-server-snapshot.sh`   | Sunday 03:00                  | 4 snapshots           |

Objects land under `s3://$S3_BUCKET/$S3_PREFIX/...` (default prefix `backups/$EMAILHUB_ENV`).

## One-time host setup

1. Install tools:

```bash
sudo bash deploy/backups/install-host-tools.sh
```

2. In Hetzner Console → Object Storage: create a Bucket (e.g. `emailhub-backups` in `fsn1`) and S3 credentials for that project.

3. Generate an age keypair offline; put only the **public** recipient on the server:

```bash
age-keygen -o age-backup.key
# AGE_RECIPIENT=age1... from the public line
```

4. Install secrets:

```bash
sudo mkdir -p /etc/emailhub
sudo cp deploy/backups/.env.backups.example /etc/emailhub/backups.env
sudo chmod 600 /etc/emailhub/backups.env
sudoedit /etc/emailhub/backups.env
```

5. For weekly snapshots, create a Hetzner Cloud API token (read/write) and set `HCLOUD_TOKEN` (and optionally `HCLOUD_SERVER_ID`).

6. Schedule (pick one):

### Option A — host cron (recommended default)

```bash
sudo bash deploy/backups/install-cron.sh
```

### Option B — Coolify Scheduled Tasks

Create three tasks that run as root on the server (same commands cron uses):

- `0 2 * * *` → `BACKUPS_ENV_FILE=/etc/emailhub/backups.env /opt/emailhub-dev/deploy/backups/run-postgres-backup.sh` (prod: `/opt/emailhub/...`)
- `30 2 * * *` → `.../run-clickhouse-backup.sh`
- `0 3 * * 0` → `.../run-server-snapshot.sh`

Keep server timezone `America/New_York` (`timedatectl`).

## Manual run / verification

```bash
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.env deploy/backups/run-postgres-backup.sh
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.env deploy/backups/run-clickhouse-backup.sh
aws --endpoint-url https://fsn1.your-objectstorage.com s3 ls s3://emailhub-backups/backups/dev/ --recursive
```

Done when: new `.age` objects appear under the prefix, and a second run with more than retention count deletes older keys.

## Restore (SD#13.8 / T-112)

Recovery target: RPO 24h, RTO 4h. Redis is not restored; after Postgres/ClickHouse are up, start the worker (schedules recreate at boot) and run `pnpm ops:requeue-queued`.

### Full recovery (new server)

1. Create the droplet and volume (Terraform / Hetzner Cloud).
2. Install Coolify, deploy the last known good git sha.
3. Decrypt backups with the offline age identity, restore Postgres then ClickHouse (or use the drill script below against throwaway containers first).
4. Start the worker.
5. `pnpm ops:requeue-queued` — enqueues `send-email` for every `message.status = queued` (`jobId = message_id`, safe to re-run).
6. Last-Admin 2FA lockout: `pnpm ops:reset-2fa -- <email>` (deletes `two_factor` + trusted devices + sessions, audit logged).

### Quarterly restore drill (throwaway containers)

Requires `AGE_IDENTITY_FILE` (private key; keep offline except during the drill) plus the usual `/etc/emailhub/backups.env` S3 settings.

```bash
sudo AGE_IDENTITY_FILE=/root/age-backup.key \
  BACKUPS_ENV_FILE=/etc/emailhub/backups.env \
  bash deploy/backups/run-restore-drill.sh
```

The script downloads the newest Postgres and ClickHouse objects, decrypts them, restores into temporary Docker containers (never the live volumes), prints elapsed time vs the 4h RTO, then tears everything down. Log the JSON result in SD#17.4.

Manual decrypt (offline):

```bash
age -d -i age-backup.key backup.dump.age > backup.dump
```

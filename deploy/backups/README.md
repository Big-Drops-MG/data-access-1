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

2. In Hetzner Console → Object Storage: create a Bucket (e.g. `emailhub-backups` in `nbg1`) and S3 credentials for that project. Use separate env files for dev (`/etc/emailhub/backups.env`, prefix `backups/dev`) and prod (`/etc/emailhub/backups.prod.env`, prefix `backups/prod`).

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

- Dev: `0 2` / `30 2` with `BACKUPS_ENV_FILE=/etc/emailhub/backups.env`
- Prod: `15 2` / `45 2` with `BACKUPS_ENV_FILE=/etc/emailhub/backups.prod.env`
- Snapshot: `0 3 * * 0` → `.../run-server-snapshot.sh`

Keep server timezone `America/New_York` (`timedatectl`).

## Manual run / verification

```bash
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.env deploy/backups/run-postgres-backup.sh
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.prod.env deploy/backups/run-postgres-backup.sh
aws --endpoint-url https://nbg1.your-objectstorage.com s3 ls s3://emailhub-backups/backups/ --recursive
```

Done when: new `.age` objects appear under the prefix, and a second run with more than retention count deletes older keys.

## Restore (high level)

1. Decrypt offline: `age -d -i age-backup.key backup.dump.age > backup.dump`
2. Postgres: `pg_restore` into a fresh instance
3. ClickHouse: unpack the tar and `clickhouse-backup restore <name>` (or native restore from the archive contents)
4. Prefer restore drills on a temporary server (quarterly per SD#13.8)

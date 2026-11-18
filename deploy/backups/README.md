# Nightly Postgres and ClickHouse backups (T-105 / SD#13.8)

Host scripts that dump Postgres and ClickHouse, encrypt with `age`, upload to DigitalOcean Spaces (`sfo3`), prune old objects, and take a weekly droplet snapshot.

| Job                        | Local time (America/New_York) | Retention             |
| -------------------------- | ----------------------------- | --------------------- |
| `run-postgres-backup.sh`   | 02:00 daily                   | 30 daily + 12 monthly |
| `run-clickhouse-backup.sh` | 02:30 daily                   | 14 daily              |
| `run-droplet-snapshot.sh`  | Sunday 03:00                  | 4 snapshots           |

Objects land under `s3://$SPACES_BUCKET/$SPACES_PREFIX/...` (default prefix `backups/$EMAILHUB_ENV`).

## One-time host setup

1. Install tools:

```bash
sudo bash deploy/backups/install-host-tools.sh
```

2. Create Spaces access keys in DigitalOcean (read/write to the backups bucket/prefix).

3. Generate an age keypair offline; put only the **public** recipient on the droplet:

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

5. Schedule (pick one):

### Option A — host cron (recommended default)

```bash
sudo bash deploy/backups/install-cron.sh
```

### Option B — Coolify Scheduled Tasks

Create three tasks that run as root on the droplet (same commands cron uses):

- `0 2 * * *` → `BACKUPS_ENV_FILE=/etc/emailhub/backups.env /opt/emailhub-dev/deploy/backups/run-postgres-backup.sh` (prod: `/opt/emailhub/...`)
- `30 2 * * *` → `.../run-clickhouse-backup.sh`
- `0 3 * * 0` → `.../run-droplet-snapshot.sh`

Keep droplet timezone `America/New_York` (`timedatectl`).

## Manual run / verification

```bash
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.env deploy/backups/run-postgres-backup.sh
sudo BACKUPS_ENV_FILE=/etc/emailhub/backups.env deploy/backups/run-clickhouse-backup.sh
aws --endpoint-url https://sfo3.digitaloceanspaces.com s3 ls s3://emailhub-da1-tfstate/backups/dev/ --recursive
```

Done when: new `.age` objects appear under the prefix, and a second run with more than retention count deletes older keys.

## Restore (high level)

1. Decrypt offline: `age -d -i age-backup.key backup.dump.age > backup.dump`
2. Postgres: `pg_restore` into a fresh instance
3. ClickHouse: unpack the tar and `clickhouse-backup restore <name>` (or native restore from the archive contents)
4. Prefer restore drills on a temporary droplet (quarterly per SD#13.8)

# Droplet hardening (T-009)

## Done When

- Password SSH fails (`PasswordAuthentication no`)
- Coolify UI reachable only through an SSH tunnel (`ssh -N -L 8000:127.0.0.1:8000 …`)

## Apply

1. Ensure Terraform Cloud Firewall `ssh_allowed_cidrs` is an office allowlist (never `0.0.0.0/0`).
2. SSH with the deploy key: `ssh -i ~/.ssh/emailhub_ed25519 root@<droplet>`.
3. Copy and run:

```bash
sudo bash deploy/harden-droplet.sh
```

4. Install Coolify if missing (script prints the official installer URL), then bind the dashboard to `127.0.0.1:8000` only.
5. Confirm `ss -tlnp | grep 8000` shows localhost only, and password auth is rejected.

Cloud-init on the droplet only mounts `/data`. Hardening is intentional as a post-provision script so existing droplets can be updated without recreating them.

## Coolify public ports

Coolify’s Traefik dashboard (`8080`) and optional DB TCP proxies must not listen on `0.0.0.0`. After Coolify upgrades, run:

```bash
sudo python3 deploy/lock-coolify-ports.py
cd /data/coolify/proxy && docker compose up -d --force-recreate
cd /data/coolify/databases/<uuid>/proxy && docker compose up -d --force-recreate
```

Verify with `ss -tlnp | grep -E ':(8080|54329)\\b'` — bindings should be `127.0.0.1` only.

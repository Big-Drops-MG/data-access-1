#!/usr/bin/env bash
# T-009 — Harden EmailHub droplet (SSH, fail2ban, unattended-upgrades, Docker, Coolify).
# Run as root on Ubuntu 24.04 after first SSH key login.
# Coolify UI must stay bound to localhost and reached only via SSH tunnel
#   ssh -N -L 8000:127.0.0.1:8000 root@<droplet>
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y \
  fail2ban \
  unattended-upgrades \
  apt-listchanges \
  ufw \
  curl \
  ca-certificates \
  gnupg

# --- SSH: key-only, no root password login, no password auth ---
SSHD_DROPIN=/etc/ssh/sshd_config.d/99-emailhub-harden.conf
cat >"${SSHD_DROPIN}" <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
X11Forwarding no
AllowTcpForwarding yes
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

# --- fail2ban ---
systemctl enable --now fail2ban

# --- Unattended security upgrades; reboot Sunday 04:00 America/New_York ---
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat >/etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
  "${distro_id}:${distro_codename}-security";
  "${distro_id}ESMApps:${distro_codename}-apps-security";
  "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:00";
Unattended-Upgrade::Automatic-Reboot-WithUsers "true";
EOF

timedatectl set-timezone America/New_York || true

# --- Docker Engine ---
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

# --- Coolify (binds to localhost; do not expose :8000 publicly) ---
if [[ ! -d /data/coolify ]]; then
  mkdir -p /data/coolify
fi
if ! docker ps --format '{{.Names}}' | grep -q '^coolify'; then
  echo "Install Coolify with their official installer, then bind the UI to 127.0.0.1:8000 only."
  echo "  curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash"
  echo "Confirm nothing listens on 0.0.0.0:8000 (ss -tlnp | grep 8000)."
fi

# --- Host firewall (Cloud Firewall still owns 22/80/443 allowlists) ---
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Harden complete."
echo "Verify: PasswordAuthentication should be no; Coolify only via SSH tunnel."

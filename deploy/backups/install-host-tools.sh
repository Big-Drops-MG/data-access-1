#!/usr/bin/env bash
# Install host tools required by T-105 backup scripts.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg unzip jq

if ! command -v age >/dev/null 2>&1; then
  apt-get install -y age || {
    AGE_VER="${AGE_VERSION:-1.2.1}"
    curl -fsSL "https://github.com/FiloSottile/age/releases/download/v${AGE_VER}/age-v${AGE_VER}-linux-amd64.tar.gz" |
      tar -xz -C /usr/local/bin --strip-components=1 age/age age/age-keygen
  }
fi

if ! command -v aws >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${tmp}/awscliv2.zip"
  unzip -q "${tmp}/awscliv2.zip" -d "${tmp}"
  "${tmp}/aws/install" --update
  rm -rf "${tmp}"
fi

mkdir -p /etc/emailhub /var/tmp/emailhub-backups
chmod 700 /etc/emailhub /var/tmp/emailhub-backups

echo "Installed: $(command -v age) $(command -v aws) $(command -v jq)"
echo "Next: copy deploy/backups/.env.backups.example to /etc/emailhub/backups.env (mode 600)"

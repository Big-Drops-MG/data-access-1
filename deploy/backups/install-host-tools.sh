#!/usr/bin/env bash
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
    arch="$(uname -m)"
    case "${arch}" in
      aarch64 | arm64) age_arch=arm64 ;;
      *) age_arch=amd64 ;;
    esac
    curl -fsSL "https://github.com/FiloSottile/age/releases/download/v${AGE_VER}/age-v${AGE_VER}-linux-${age_arch}.tar.gz" |
      tar -xz -C /usr/local/bin --strip-components=1 age/age age/age-keygen
  }
fi

aws_works() {
  command -v aws >/dev/null 2>&1 && aws --version >/dev/null 2>&1
}

if ! aws_works; then
  tmp="$(mktemp -d)"
  arch="$(uname -m)"
  case "${arch}" in
    aarch64 | arm64) aws_arch=aarch64 ;;
    *) aws_arch=x86_64 ;;
  esac
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" -o "${tmp}/awscliv2.zip"
  unzip -q "${tmp}/awscliv2.zip" -d "${tmp}"
  "${tmp}/aws/install" --update
  rm -rf "${tmp}"
  if ! aws_works; then
    echo "aws CLI install failed for arch=$(uname -m)" >&2
    exit 1
  fi
fi

mkdir -p /etc/emailhub /var/tmp/emailhub-backups
chmod 700 /etc/emailhub /var/tmp/emailhub-backups

echo "Installed: $(command -v age) $(command -v aws) $(command -v jq)"
echo "Next: copy deploy/backups/.env.backups.example to /etc/emailhub/backups.env (mode 600)"

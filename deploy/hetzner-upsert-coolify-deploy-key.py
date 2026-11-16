#!/usr/bin/env python3
"""Deprecated: do not SQL-upsert Coolify private keys.

Coolify stores private_keys.private_key as Laravel-encrypted ciphertext (APP_KEY).
Writing a raw PEM causes DecryptException: The payload is invalid on Deploy.

Use Coolify UI → Keys → Private Keys, or run:
  deploy/hetzner-fix-coolify-git-key-decrypt.sh
when a bad key is already attached. This stack deploys via coolify-up + GHCR
and does not need a Git deploy key.
"""
from __future__ import annotations

import sys


def main() -> int:
    print(
        "Refusing to SQL-upsert a Coolify private key (must be encrypted via UI).\n"
        "If Deploy fails with DecryptException on the Git SSH key, run:\n"
        "  bash deploy/hetzner-fix-coolify-git-key-decrypt.sh\n"
        "on the Hetzner Coolify host.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

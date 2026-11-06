#!/usr/bin/env python3
"""Write SQL to upsert Coolify private_keys from a PEM file."""
from __future__ import annotations

import pathlib
import sys
import uuid


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "usage: hetzner-upsert-coolify-deploy-key.py <pem-path> <fingerprint> <sql-out>",
            file=sys.stderr,
        )
        return 2
    pem_path = pathlib.Path(sys.argv[1])
    fingerprint = sys.argv[2]
    out_path = pathlib.Path(sys.argv[3])
    priv = pem_path.read_text()
    tag = "pk" + uuid.uuid4().hex
    if tag in priv:
        raise SystemExit("unlucky dollar-quote collision")
    sql = f"""
INSERT INTO private_keys (uuid, name, description, private_key, is_git_related, team_id, created_at, updated_at, fingerprint)
SELECT '{uuid.uuid4()}', 'emailhub-github-deploy', 'Hetzner Coolify git deploy key', ${tag}${priv}${tag}$, true, 0, NOW(), NOW(), '{fingerprint}'
WHERE NOT EXISTS (SELECT 1 FROM private_keys WHERE name = 'emailhub-github-deploy');
UPDATE private_keys
SET private_key = ${tag}${priv}${tag}$,
    fingerprint = '{fingerprint}',
    is_git_related = true,
    updated_at = NOW()
WHERE name = 'emailhub-github-deploy';
"""
    out_path.write_text(sql)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

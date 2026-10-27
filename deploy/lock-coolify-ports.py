#!/usr/bin/env python3
"""Bind Coolify Traefik dashboard and DB public proxies to 127.0.0.1 only."""

from pathlib import Path


def bind_localhost(path: Path, port: str) -> bool:
    text = path.read_text()
    old_quoted = f"'{port}:{port}'"
    new_quoted = f"'127.0.0.1:{port}:{port}'"
    old_plain = f"{port}:{port}"
    new_plain = f"127.0.0.1:{port}:{port}"
    if new_quoted in text or f"127.0.0.1:{port}:{port}" in text:
        print(f"{path}: already localhost-bound for {port}")
        return False
    if old_quoted in text:
        path.write_text(text.replace(old_quoted, new_quoted))
        print(f"{path}: bound {port} to 127.0.0.1")
        return True
    if old_plain in text:
        path.write_text(text.replace(old_plain, new_plain, 1))
        print(f"{path}: bound {port} to 127.0.0.1")
        return True
    print(f"{path}: no {port} mapping found")
    return False


def main() -> None:
    bind_localhost(Path("/data/coolify/proxy/docker-compose.yml"), "8080")
    bind_localhost(
        Path(
            "/data/coolify/databases/gdhbxcxcr2rsyc9fimbllnvu/proxy/docker-compose.yaml"
        ),
        "54329",
    )


if __name__ == "__main__":
    main()

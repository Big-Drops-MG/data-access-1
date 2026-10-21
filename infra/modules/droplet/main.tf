terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.50"
    }
  }
}

locals {
  volume_name = "${var.name}-data"
  tags        = distinct(concat(var.tags, ["emailhub", var.name]))
  user_data   = <<-EOT
    #cloud-config
    package_update: true
    packages:
      - curl
      - ca-certificates
    runcmd:
      - |
        set -euo pipefail
        for i in $(seq 1 60); do
          DEVICE="$(ls /dev/disk/by-id/scsi-0DO_Volume_* 2>/dev/null | head -n1 || true)"
          if [ -n "$DEVICE" ]; then
            break
          fi
          sleep 2
        done
        if [ -z "$DEVICE" ]; then
          echo "data volume device not found" >&2
          exit 1
        fi
        mkdir -p /data
        for m in /mnt/*; do
          if mountpoint -q "$m" 2>/dev/null; then
            umount "$m" || true
          fi
        done
        if ! mountpoint -q /data; then
          mount -o discard,defaults,noatime "$DEVICE" /data
        fi
        UUID="$(blkid -s UUID -o value "$DEVICE")"
        sed -i "\|$DEVICE|d" /etc/fstab || true
        sed -i "/\\/mnt\\//d" /etc/fstab || true
        if ! grep -q "$UUID" /etc/fstab; then
          echo "UUID=$UUID /data ext4 defaults,nofail,discard,noatime 0 2" >> /etc/fstab
        fi
        mkdir -p /data/postgres /data/clickhouse /data/redis /data/imports /data/coolify
        ${var.user_data_extra}
  EOT
}

resource "digitalocean_volume" "data" {
  region                   = var.region
  name                     = local.volume_name
  size                     = var.volume_size_gb
  initial_filesystem_type  = "ext4"
  initial_filesystem_label = "data"
  description              = "EmailHub /data volume for ${var.name}"
  tags                     = local.tags
}

resource "digitalocean_droplet" "this" {
  name       = var.name
  region     = var.region
  size       = var.size
  image      = var.image
  ssh_keys   = var.ssh_key_ids
  tags       = local.tags
  user_data  = local.user_data
  monitoring = true
  ipv6       = false
  vpc_uuid   = var.vpc_uuid != "" ? var.vpc_uuid : null
  volume_ids = [digitalocean_volume.data.id]

  lifecycle {
    ignore_changes = [
      user_data,
      ssh_keys,
    ]
  }
}

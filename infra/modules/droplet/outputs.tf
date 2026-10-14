output "droplet_id" {
  value = digitalocean_droplet.this.id
}

output "droplet_name" {
  value = digitalocean_droplet.this.name
}

output "ipv4_address" {
  value = digitalocean_droplet.this.ipv4_address
}

output "volume_id" {
  value = digitalocean_volume.data.id
}

output "volume_name" {
  value = digitalocean_volume.data.name
}

output "droplet_id" {
  value = module.droplet.droplet_id
}

output "droplet_ipv4" {
  value = module.droplet.ipv4_address
}

output "volume_id" {
  value = module.droplet.volume_id
}

output "firewall_id" {
  value = try(module.firewall[0].firewall_id, null)
}

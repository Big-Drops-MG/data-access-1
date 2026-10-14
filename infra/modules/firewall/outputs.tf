output "firewall_id" {
  value = digitalocean_firewall.this.id
}

output "firewall_name" {
  value = digitalocean_firewall.this.name
}

output "record_id" {
  value = cloudflare_record.app.id
}

output "hostname" {
  value = cloudflare_record.app.hostname
}

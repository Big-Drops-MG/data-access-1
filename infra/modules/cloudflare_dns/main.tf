resource "cloudflare_record" "app" {
  zone_id = var.zone_id
  name    = var.name
  type    = "A"
  value   = var.ipv4_address
  ttl     = 1     # automatic when proxied=false on some plans; DNS-only
  proxied = false # grey cloud — Caddy terminates TLS; SNS can reach the webhook
  comment = var.comment
}

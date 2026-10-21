variable "zone_id" {
  type        = string
  description = "Cloudflare zone ID for dataaccess1.com."
}

variable "name" {
  type        = string
  description = "DNS record name (e.g. emailhub-dev or emailhub)."
}

variable "ipv4_address" {
  type        = string
  description = "Droplet public IPv4 for the A record."
}

variable "comment" {
  type    = string
  default = "Managed by Terraform (EmailHub)"
}

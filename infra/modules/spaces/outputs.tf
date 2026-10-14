output "bucket_name" {
  value = digitalocean_spaces_bucket.this.name
}

output "bucket_urn" {
  value = digitalocean_spaces_bucket.this.urn
}

output "bucket_domain_name" {
  value = digitalocean_spaces_bucket.this.bucket_domain_name
}

output "region" {
  value = digitalocean_spaces_bucket.this.region
}

output "endpoint" {
  value = "https://${var.region}.digitaloceanspaces.com"
}

provider "digitalocean" {}

provider "aws" {
  region = var.aws_region
}

provider "cloudflare" {
  # CLOUDFLARE_API_TOKEN from the environment (never commit tokens).
}

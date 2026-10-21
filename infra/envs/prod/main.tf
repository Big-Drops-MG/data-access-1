module "droplet" {
  source = "../../modules/droplet"

  name           = var.droplet_name
  region         = var.region
  size           = var.droplet_size
  volume_size_gb = var.volume_size_gb
  ssh_key_ids    = var.ssh_key_ids
  vpc_uuid       = var.vpc_uuid
  tags           = ["env:prod", "project:emailhub"]
}

module "firewall" {
  source = "../../modules/firewall"
  count  = var.create_firewall ? 1 : 0

  name              = "${var.droplet_name}-fw"
  droplet_ids       = [module.droplet.droplet_id]
  ssh_allowed_cidrs = var.ssh_allowed_cidrs
  tags              = ["env:prod", "project:emailhub"]
}

module "ses_events" {
  source = "../../modules/ses_events"
  count  = var.enable_aws_ses ? 1 : 0

  name_prefix = var.droplet_name
  webhook_url = "https://${var.app_hostname}/api/ext/webhooks/ses"
  tags = {
    Environment = "prod"
    Project     = "emailhub"
  }
}

module "ses_iam" {
  source = "../../modules/ses_iam"
  count  = var.enable_aws_ses ? 1 : 0

  user_name = "${var.droplet_name}-app"
  tags = {
    Environment = "prod"
    Project     = "emailhub"
  }
}

module "cloudflare_dns" {
  source = "../../modules/cloudflare_dns"
  count  = var.enable_cloudflare_dns ? 1 : 0

  zone_id      = var.cloudflare_zone_id
  name         = var.app_dns_name
  ipv4_address = module.droplet.ipv4_address
  comment      = "EmailHub Prod app host (DNS only)"
}

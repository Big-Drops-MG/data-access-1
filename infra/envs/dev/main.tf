module "droplet" {
  source = "../../modules/droplet"

  name           = var.droplet_name
  region         = var.region
  size           = var.droplet_size
  volume_size_gb = var.volume_size_gb
  ssh_key_ids    = var.ssh_key_ids
  vpc_uuid       = var.vpc_uuid
  tags           = ["env:dev", "project:emailhub"]
}

module "firewall" {
  source = "../../modules/firewall"
  count  = var.create_firewall ? 1 : 0

  name              = "${var.droplet_name}-fw"
  droplet_ids       = [module.droplet.droplet_id]
  ssh_allowed_cidrs = var.ssh_allowed_cidrs
  tags              = ["env:dev", "project:emailhub"]
}

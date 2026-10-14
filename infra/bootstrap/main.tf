module "state_and_backups" {
  source = "../modules/spaces"

  name   = var.bucket_name
  region = var.region
  acl    = "private"
}

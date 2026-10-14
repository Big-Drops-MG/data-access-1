output "bucket_name" {
  value = module.state_and_backups.bucket_name
}

output "endpoint" {
  value = module.state_and_backups.endpoint
}

output "region" {
  value = module.state_and_backups.region
}

output "backend_hcl_hint" {
  description = "Values to put in envs/*/backend.hcl after bootstrap apply."
  value = {
    bucket   = module.state_and_backups.bucket_name
    region   = module.state_and_backups.region
    endpoint = module.state_and_backups.endpoint
    key_dev  = "env/dev/terraform.tfstate"
    key_prod = "env/prod/terraform.tfstate"
  }
}

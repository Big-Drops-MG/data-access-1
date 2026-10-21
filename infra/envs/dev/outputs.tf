output "droplet_id" {
  value = module.droplet.droplet_id
}

output "droplet_ipv4" {
  value = module.droplet.ipv4_address
}

output "volume_id" {
  value = module.droplet.volume_id
}

output "firewall_id" {
  value = try(module.firewall[0].firewall_id, null)
}

output "ses_configuration_set_name" {
  value = try(module.ses_events[0].configuration_set_name, null)
}

output "ses_sns_topic_arn" {
  value = try(module.ses_events[0].sns_topic_arn, null)
}

output "ses_events_dlq_url" {
  value = try(module.ses_events[0].ses_events_dlq_url, null)
}

output "ses_iam_user_name" {
  value = try(module.ses_iam[0].user_name, null)
}

output "ses_iam_user_arn" {
  value = try(module.ses_iam[0].user_arn, null)
}

output "ses_iam_policy_json" {
  value     = try(module.ses_iam[0].policy_json, null)
  sensitive = true
}

output "app_dns_record_id" {
  value = try(module.cloudflare_dns[0].record_id, null)
}

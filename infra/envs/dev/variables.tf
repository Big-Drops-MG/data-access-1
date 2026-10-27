variable "region" {
  type    = string
  default = "nyc3"
}

variable "droplet_name" {
  type    = string
  default = "emailhub-dev"
}

variable "droplet_size" {
  type        = string
  description = "SD#13.1 Dev: Premium 2 vCPU / 8 GB."
  default     = "s-2vcpu-8gb-amd"
}

variable "volume_size_gb" {
  type        = number
  description = "SD#13.1 Dev: 30 GB block volume at /data."
  default     = 30
}

variable "ssh_key_ids" {
  type        = list(string)
  description = "DigitalOcean SSH key fingerprint or IDs."
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed on TCP/22 (SD#13.3 office allowlist). Required — never default to 0.0.0.0/0."

  validation {
    condition = length(var.ssh_allowed_cidrs) > 0 && alltrue([
      for cidr in var.ssh_allowed_cidrs :
      cidr != "0.0.0.0/0" && cidr != "::/0"
    ])
    error_message = "ssh_allowed_cidrs must be a non-empty office allowlist and must not include 0.0.0.0/0 or ::/0."
  }
}

variable "vpc_uuid" {
  type    = string
  default = ""
}

variable "create_firewall" {
  type        = bool
  description = "Attach a Cloud Firewall to this droplet."
  default     = true
}

variable "aws_region" {
  type        = string
  description = "SES_REGION for this environment."
  default     = "us-east-1"
}

variable "enable_aws_ses" {
  type        = bool
  description = "Create SES configuration set, SNS topic, SQS DLQ, and IAM user."
  default     = true
}

variable "enable_cloudflare_dns" {
  type        = bool
  description = "Manage the app hostname A record in Cloudflare (DNS only)."
  default     = true
}

variable "app_hostname" {
  type        = string
  description = "Public app hostname used for SNS webhook HTTPS subscription."
  default     = "emailhub-dev.dataaccess1.com"
}

variable "app_dns_name" {
  type        = string
  description = "Cloudflare DNS record name (relative to the zone)."
  default     = "emailhub-dev"
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for dataaccess1.com. Required when enable_cloudflare_dns is true."
  default     = ""
  sensitive   = true
}

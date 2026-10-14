variable "region" {
  type    = string
  default = "nyc3"
}

variable "droplet_name" {
  type    = string
  default = "emailhub-prod"
}

variable "droplet_size" {
  type        = string
  description = "SD#13.1 Prod: Premium 4 vCPU / 16 GB."
  default     = "s-4vcpu-16gb-amd"
}

variable "volume_size_gb" {
  type        = number
  description = "SD#13.1 Prod: 100 GB block volume at /data."
  default     = 100
}

variable "ssh_key_ids" {
  type        = list(string)
  description = "DigitalOcean SSH key fingerprint or IDs."
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed on TCP/22 (SD#13.3 office allowlist). Must be tightened for Prod; do not leave world-open."
  default     = ["0.0.0.0/0", "::/0"]
}

variable "vpc_uuid" {
  type    = string
  default = ""
}

variable "create_firewall" {
  type    = bool
  default = true
}

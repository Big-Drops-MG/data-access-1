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
  description = "CIDRs allowed on TCP/22 (SD#13.3 office allowlist). Temporary default is open; tighten before Prod."
  default     = ["0.0.0.0/0", "::/0"]
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

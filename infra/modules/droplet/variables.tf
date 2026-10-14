variable "name" {
  type        = string
  description = "Droplet name (also used for volume and tags)."
}

variable "region" {
  type        = string
  description = "DigitalOcean region slug."
  default     = "nyc3"
}

variable "size" {
  type        = string
  description = "Droplet size slug (Premium shared CPU)."
}

variable "image" {
  type        = string
  description = "Droplet image slug."
  default     = "ubuntu-24-04-x64"
}

variable "volume_size_gb" {
  type        = number
  description = "Block volume size in GB, mounted at /data."
}

variable "ssh_key_ids" {
  type        = list(string)
  description = "DigitalOcean SSH key IDs to install on the droplet."
}

variable "vpc_uuid" {
  type        = string
  description = "Optional VPC UUID. Empty uses the account default VPC for the region."
  default     = ""
}

variable "tags" {
  type        = list(string)
  description = "Tags applied to the droplet and volume."
  default     = []
}

variable "user_data_extra" {
  type        = string
  description = "Optional extra cloud-init / shell appended after /data mount setup."
  default     = ""
}

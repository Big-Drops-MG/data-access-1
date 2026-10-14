variable "name" {
  type        = string
  description = "Cloud Firewall name."
}

variable "droplet_ids" {
  type        = list(string)
  description = "Droplet IDs protected by this firewall."
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed to connect on TCP/22."
}

variable "tags" {
  type        = list(string)
  description = "Optional tags."
  default     = []
}

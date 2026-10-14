variable "name" {
  type        = string
  description = "Spaces bucket name (globally unique)."
}

variable "region" {
  type        = string
  description = "Spaces region. SD#13 uses sfo3 for backups and Terraform state."
  default     = "sfo3"
}

variable "acl" {
  type        = string
  description = "Bucket ACL."
  default     = "private"
}

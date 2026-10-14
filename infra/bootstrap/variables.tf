variable "bucket_name" {
  type        = string
  description = "Globally unique Spaces bucket for Terraform state and backups."
  default     = "emailhub-da1-tfstate"
}

variable "region" {
  type        = string
  description = "Spaces region (SD#13: sfo3)."
  default     = "sfo3"
}

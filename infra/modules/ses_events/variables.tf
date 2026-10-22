variable "name_prefix" {
  type        = string
  description = "Prefix for SES/SNS/SQS resource names (e.g. emailhub-dev)."
}

variable "webhook_url" {
  type        = string
  description = "HTTPS endpoint for SES event notifications (SNS subscription)."

  validation {
    condition     = startswith(var.webhook_url, "https://")
    error_message = "webhook_url must use https://"
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}

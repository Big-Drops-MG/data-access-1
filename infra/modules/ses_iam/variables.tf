variable "user_name" {
  type        = string
  description = "IAM user name for the EmailHub app (least privilege)."
}

variable "tags" {
  type    = map(string)
  default = {}
}

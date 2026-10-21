output "user_name" {
  value = aws_iam_user.app.name
}

output "user_arn" {
  value = aws_iam_user.app.arn
}

output "policy_json" {
  value = data.aws_iam_policy_document.app.json
}

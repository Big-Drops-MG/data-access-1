resource "aws_iam_user" "app" {
  name = var.user_name
  path = "/emailhub/"
  tags = var.tags
}

data "aws_iam_policy_document" "app" {
  # SD#11.2 — exact action list; SES APIs require Resource "*".
  statement {
    sid    = "SesSendAndIdentities"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:CreateEmailIdentity",
      "ses:GetEmailIdentity",
      "ses:GetAccount",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CloudWatchReputationMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:GetMetricStatistics",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_user_policy" "app" {
  name   = "emailhub-ses-minimal"
  user   = aws_iam_user.app.name
  policy = data.aws_iam_policy_document.app.json
}

# Access keys are created out-of-band and stored in Coolify — not in Terraform state.

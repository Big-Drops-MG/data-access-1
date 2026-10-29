resource "aws_sqs_queue" "ses_events_dlq" {
  name                       = "${var.name_prefix}-ses-events-dlq"
  message_retention_seconds  = 1209600 # 14 days (SD#11.3)
  visibility_timeout_seconds = 60
  sqs_managed_sse_enabled    = true
  tags                       = var.tags
}

data "aws_iam_policy_document" "ses_events_dlq" {
  statement {
    sid    = "AllowSNSRedrive"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["sns.amazonaws.com"]
    }

    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.ses_events_dlq.arn]

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_sns_topic.ses_events.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "ses_events_dlq" {
  queue_url = aws_sqs_queue.ses_events_dlq.id
  policy    = data.aws_iam_policy_document.ses_events_dlq.json
}

data "aws_caller_identity" "current" {}
resource "aws_kms_key" "ses_events" {
  description             = "SNS encryption for ${var.name_prefix} SES events"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  tags                    = var.tags

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "${var.name_prefix}-ses-events-kms"
    Statement = [
      {
        Sid    = "EnableRootAccountAdmin"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "AllowSNS"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AllowSES"
        Effect = "Allow"
        Principal = {
          Service = "ses.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "ses_events" {
  name          = "alias/${var.name_prefix}-ses-events"
  target_key_id = aws_kms_key.ses_events.key_id
}

resource "aws_sns_topic" "ses_events" {
  name              = "${var.name_prefix}-ses-events"
  kms_master_key_id = aws_kms_key.ses_events.arn
  tags              = var.tags
}

data "aws_iam_policy_document" "ses_publish" {
  statement {
    sid    = "AllowSESPublish"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ses_events.arn]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "ses_events" {
  arn    = aws_sns_topic.ses_events.arn
  policy = data.aws_iam_policy_document.ses_publish.json
}

resource "aws_sns_topic_subscription" "ses_webhook" {
  topic_arn = aws_sns_topic.ses_events.arn
  protocol  = "https"
  endpoint  = var.webhook_url

  # Confirmation stays pending until the app confirms the SNS subscription.
  endpoint_auto_confirms = false

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ses_events_dlq.arn
  })

  depends_on = [aws_sqs_queue_policy.ses_events_dlq]
}

resource "aws_sesv2_configuration_set" "this" {
  configuration_set_name = "${var.name_prefix}-ses"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  tags = var.tags
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  configuration_set_name = aws_sesv2_configuration_set.this.configuration_set_name
  event_destination_name = "sns-all-events"

  event_destination {
    enabled = true
    matching_event_types = [
      "SEND",
      "REJECT",
      "BOUNCE",
      "COMPLAINT",
      "DELIVERY",
      "OPEN",
      "CLICK",
      "RENDERING_FAILURE",
      "DELIVERY_DELAY",
    ]

    sns_destination {
      topic_arn = aws_sns_topic.ses_events.arn
    }
  }
}

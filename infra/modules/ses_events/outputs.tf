output "configuration_set_name" {
  value = aws_sesv2_configuration_set.this.configuration_set_name
}

output "sns_topic_arn" {
  value = aws_sns_topic.ses_events.arn
}

output "ses_events_dlq_arn" {
  value = aws_sqs_queue.ses_events_dlq.arn
}

output "ses_events_dlq_url" {
  value = aws_sqs_queue.ses_events_dlq.url
}

output "sns_subscription_arn" {
  value = aws_sns_topic_subscription.ses_webhook.arn
}

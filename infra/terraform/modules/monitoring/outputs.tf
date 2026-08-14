output "cloudwatch_addon_arn" {
  description = "ARN of the CloudWatch observability addon"
  value       = aws_eks_addon.cloudwatch_observability.arn
}

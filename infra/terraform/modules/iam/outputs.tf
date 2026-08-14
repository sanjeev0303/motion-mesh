output "vpc_cni_role_arn" {
  description = "ARN of IAM role for VPC CNI service account"
  value       = module.vpc_cni_irsa.iam_role_arn
}

output "lbc_role_arn" {
  description = "ARN of IAM role for AWS Load Balancer Controller"
  value       = module.load_balancer_controller_irsa.iam_role_arn
}

output "api_role_arn" {
  description = "ARN of IAM role for API pods"
  value       = aws_iam_role.api.arn
}

output "worker_role_arn" {
  description = "ARN of IAM role for Worker pods"
  value       = aws_iam_role.worker.arn
}

output "external_dns_role_arn" {
  description = "ARN of IAM role for ExternalDNS"
  value       = aws_iam_role.external_dns.arn
}

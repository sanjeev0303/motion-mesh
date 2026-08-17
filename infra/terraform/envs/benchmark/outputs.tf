output "vpc_id" {
  value = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "aurora_endpoint" {
  value = module.aurora.cluster_endpoint
}

output "redis_endpoint" {
  value = module.elasticache.redis_endpoint
}

output "s3_bucket_domain" {
  value = module.s3.bucket_domain_name
}

output "bucket_id" {
  value = module.s3.bucket_id
}

output "bucket_region" {
  value = module.s3.bucket_region
}


output "api_repository_url" {
  value = module.ecr_api.repository_url
}

output "worker_repository_url" {
  value = module.ecr_worker.repository_url
}

output "region" {
  value = data.aws_region.current.name
}

output "web_acl_arn" {
  value = module.waf.web_acl_arn
}

output "acm_certificate_arn" {
  value = var.acm_certificate_arn
}

output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_ca" {
  value = module.eks.cluster_ca
}

output "cluster_version" {
  value = module.eks.cluster_version
}

output "oidc_provider_arn" {
  value = module.eks.oidc_provider_arn
}

output "private_subnets" {
  value = module.vpc.private_subnets
}

output "public_subnets" {
  value = module.vpc.public_subnets
}

output "aurora_master_secret_arn" {
  value = module.aurora.master_user_secret_arn
}

output "alb_security_group_id" {
  description = "Security Group ID of the ALB"
  value       = module.alb.security_group_id
}

output "lbc_role_arn" {
  description = "IAM Role ARN for AWS Load Balancer Controller"
  value       = module.iam.lbc_role_arn
}

output "external_dns_role_arn" {
  description = "IAM Role ARN for ExternalDNS"
  value       = module.iam.external_dns_role_arn
}

output "api_domain_name" {
  value = var.api_domain_name
}

output "route53_zone_id" {
  value = var.route53_zone_id
}

output "diagnostic_repository_url" {
  value = module.ecr_diagnostic.repository_url
}

output "dns_domain_name" {
  value = var.dns_domain_name
}

output "media_domain_name" {
  value = var.media_domain_name
}

output "cookie_domain" {
  value = var.cookie_domain
}

output "external_secrets_iam_role_arn" {
  description = "IAM Role ARN for External Secrets Operator"
  value       = module.iam.external_secrets_role_arn
}

output "redis_secret_arn" {
  description = "ARN of the Secrets Manager secret for Redis"
  value       = module.elasticache.redis_secret_arn
}

output "cloudfront_signing_secret_arn" {
  description = "ARN of the Secrets Manager secret for CloudFront signing"
  value       = aws_secretsmanager_secret.cloudfront_signing.arn
}

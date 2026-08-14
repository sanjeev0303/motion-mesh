variable "environment" {
  description = "Environment name"
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster to associate roles with"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for Motionmesh assets"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 Hosted Zone ID for ExternalDNS"
  type        = string
  default     = ""
}

variable "oidc_provider_arn" {
  description = "The ARN of the OIDC Provider for EKS"
  type        = string
}

variable "aurora_master_secret_arn" {
  description = "The ARN of the Aurora master secret in AWS Secrets Manager"
  type        = string
}

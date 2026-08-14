variable "environment" {
  description = "Environment name"
  type        = string
}

variable "s3_bucket_domain" {
  description = "The domain name of the S3 bucket acting as the origin"
  type        = string
}

variable "media_domain_name" {
  description = "The custom domain name for media delivery (e.g., media.motionmesh.co.in)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "The ARN of the ACM certificate to use for the custom domain"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 Hosted Zone ID for alias records"
  type        = string
  default     = ""
}

variable "cloudfront_signing_public_key" {
  description = "PEM encoded RSA public key for CloudFront signed cookies"
  type        = string
}

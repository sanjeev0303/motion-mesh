output "cloudfront_domain_name" {
  description = "The domain name corresponding to the distribution"
  value       = module.cloudfront.cloudfront_distribution_domain_name
}

output "cloudfront_distribution_id" {
  description = "The identifier for the distribution"
  value       = module.cloudfront.cloudfront_distribution_id
}

output "media_domain_name" {
  description = "The custom media domain name (if configured), otherwise the default distribution domain"
  value       = var.media_domain_name != "" ? var.media_domain_name : module.cloudfront.cloudfront_distribution_domain_name
}

output "cloudfront_public_key_id" {
  description = "The ID of the CloudFront public key"
  value       = aws_cloudfront_public_key.this.id
}

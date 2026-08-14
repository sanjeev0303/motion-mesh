output "bucket_id" {
  description = "The name of the bucket"
  value       = module.s3_bucket.s3_bucket_id
}

output "bucket_arn" {
  description = "The ARN of the bucket"
  value       = module.s3_bucket.s3_bucket_arn
}

output "bucket_domain_name" {
  description = "The bucket domain name"
  value       = module.s3_bucket.s3_bucket_bucket_domain_name
}

output "bucket_region" {
  description = "The AWS region this bucket resides in"
  value       = module.s3_bucket.s3_bucket_region
}

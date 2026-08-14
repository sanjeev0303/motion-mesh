output "cluster_endpoint" {
  description = "Writer endpoint for the cluster"
  value       = module.aurora.cluster_endpoint
}

output "cluster_reader_endpoint" {
  description = "A read-only endpoint for the cluster, automatically load-balanced across replicas"
  value       = module.aurora.cluster_reader_endpoint
}

output "cluster_database_name" {
  description = "Name for an automatically created database on cluster creation"
  value       = module.aurora.cluster_database_name
}

output "cluster_master_username" {
  description = "The database master username"
  value       = module.aurora.cluster_master_username
}

output "cluster_port" {
  description = "The database port"
  value       = module.aurora.cluster_port
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret for the master DB user"
  value       = module.aurora.cluster_master_user_secret[0].secret_arn
}

output "cluster_endpoint" {
  description = "Writer endpoint for the cluster"
  value       = aws_db_instance.this.endpoint
}

output "cluster_reader_endpoint" {
  description = "A read-only endpoint for the cluster"
  value       = aws_db_instance.this.endpoint
}

output "cluster_database_name" {
  description = "Name for an automatically created database on cluster creation"
  value       = aws_db_instance.this.db_name
}

output "cluster_master_username" {
  description = "The database master username"
  value       = aws_db_instance.this.username
}

output "cluster_port" {
  description = "The database port"
  value       = aws_db_instance.this.port
}

output "master_user_secret_arn" {
  description = "ARN of the Secrets Manager secret for the master DB user"
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

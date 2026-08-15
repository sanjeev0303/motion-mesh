output "redis_endpoint" {
  description = "Primary endpoint for the Redis cluster"
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Reader endpoint for the Redis cluster"
  value       = aws_elasticache_replication_group.this.reader_endpoint_address
}

output "redis_port" {
  description = "Port of the ElastiCache Redis cluster"
  value       = aws_elasticache_replication_group.this.port
}

output "redis_secret_arn" {
  description = "ARN of the Secrets Manager secret for Redis"
  value       = aws_secretsmanager_secret.redis.arn
}

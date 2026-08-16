resource "aws_elasticache_subnet_group" "this" {
  name       = "motionmesh-${var.environment}-redis"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "redis" {
  name_prefix = "motionmesh-${var.environment}-redis-sg"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = "motionmesh-${var.environment}"
  description                = "Redis cluster for MotionMesh ${var.environment}"
  node_type                  = "cache.t3.micro"
  num_cache_clusters         = 2
  engine_version             = "7.1"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true

  tags = {
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret" "redis" {
  name_prefix             = "motionmesh/${var.environment}/redis-"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    host = aws_elasticache_replication_group.this.primary_endpoint_address
    port = aws_elasticache_replication_group.this.port
  })
}

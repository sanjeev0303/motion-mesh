resource "aws_db_instance" "this" {
  identifier           = "motionmesh-${var.environment}"
  allocated_storage    = 20
  storage_type         = "gp3"
  engine               = "postgres"
  engine_version       = "15.18"
  instance_class       = "db.t3.micro"
  db_name              = var.database_name
  username             = "root"
  manage_master_user_password = true
  
  vpc_security_group_ids = [aws_security_group.this.id]
  db_subnet_group_name   = aws_db_subnet_group.this.name
  
  skip_final_snapshot    = true
  apply_immediately      = true
  
  tags = {
    Environment = var.environment
    Terraform   = "true"
  }
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_db_subnet_group" "this" {
  name       = "motionmesh-${var.environment}-db"
  subnet_ids = var.subnet_ids

  tags = {
    Environment = var.environment
  }
}

resource "aws_security_group" "this" {
  name_prefix = "motionmesh-${var.environment}-db"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = var.allowed_security_group_ids
  }
}

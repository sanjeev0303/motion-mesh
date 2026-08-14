module "aurora" {
  source  = "terraform-aws-modules/rds-aurora/aws"
  version = "~> 9.0"

  name           = "motionmesh-${var.environment}"
  engine         = "aurora-postgresql"
  engine_version = var.engine_version

  instances = {
    1 = {
      instance_class = var.instance_class
    }
    2 = {
      instance_class = var.instance_class
    }
  }

  vpc_id                 = var.vpc_id
  db_subnet_group_name   = aws_db_subnet_group.this.name
  create_db_subnet_group = false

  create_security_group = true
  security_group_rules = {
    ingress_allowed_sgs = {
      source_security_group_id = var.allowed_security_group_ids[0]
    }
  }

  master_username             = "root"
  manage_master_user_password = true
  database_name               = var.database_name

  apply_immediately   = true
  skip_final_snapshot = true

  tags = {
    Environment = var.environment
    Terraform   = "true"
  }
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_db_subnet_group" "this" {
  name       = "motionmesh-${var.environment}-aurora"
  subnet_ids = var.subnet_ids

  tags = {
    Environment = var.environment
  }
}

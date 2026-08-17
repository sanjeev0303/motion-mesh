module "vpc" {
  source                 = "../../modules/vpc"
  name                   = "motionmesh-${var.environment}"
  cidr                   = var.vpc_cidr
  azs                    = var.availability_zones
  public_subnets         = ["10.1.1.0/24", "10.1.2.0/24", "10.1.3.0/24"]
  private_subnets        = ["10.1.4.0/24", "10.1.5.0/24", "10.1.6.0/24"]
  database_subnets       = ["10.1.7.0/24", "10.1.8.0/24", "10.1.9.0/24"]
  single_nat_gateway     = false
  one_nat_gateway_per_az = true
  tags = {
    Environment = var.environment
  }
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

module "eks" {
  source          = "../../modules/eks"
  environment     = var.environment
  cluster_name    = "motionmesh-${var.environment}"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  cluster_version = var.cluster_version
}

module "aurora" {
  source                     = "../../modules/aurora"
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.database_subnets
  database_name              = "motionmesh"
  engine_version             = var.aurora_engine_version
  instance_class             = var.aurora_instance_class
  allowed_security_group_ids = [module.eks.node_security_group_id]
}

module "elasticache" {
  source                     = "../../modules/elasticache"
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.database_subnets
  allowed_security_group_ids = [module.eks.node_security_group_id]
}

module "s3" {
  source               = "../../modules/s3"
  environment          = var.environment
  bucket_name          = "motionmesh-assets-${var.environment}-ap-south-1-${data.aws_caller_identity.current.account_id}"
  allowed_cors_origins = var.allowed_cors_origins
}




module "alb" {
  source      = "../../modules/alb"
  environment = var.environment
  vpc_id      = module.vpc.vpc_id
}

module "waf" {
  source      = "../../modules/waf"
  environment = var.environment
}

module "iam" {
  source                   = "../../modules/iam"
  environment              = var.environment
  cluster_name             = module.eks.cluster_name
  s3_bucket_arn            = module.s3.bucket_arn
  route53_zone_id          = var.route53_zone_id
  oidc_provider_arn        = module.eks.oidc_provider_arn
  aurora_master_secret_arn = module.aurora.master_user_secret_arn
}

module "monitoring" {
  source       = "../../modules/monitoring"
  environment  = var.environment
  cluster_name = module.eks.cluster_id
}

module "ecr_api" {
  source          = "../../modules/ecr"
  environment     = var.environment
  repository_name = "motionmesh-api"
}

module "ecr_worker" {
  source          = "../../modules/ecr"
  environment     = var.environment
  repository_name = "motionmesh-worker"
}

module "ecr_captions" {
  source          = "../../modules/ecr"
  environment     = var.environment
  repository_name = "motionmesh-captions"
}

module "ecr_diagnostic" {
  source          = "../../modules/ecr"
  environment     = var.environment
  repository_name = "motionmesh-diagnostic"
}

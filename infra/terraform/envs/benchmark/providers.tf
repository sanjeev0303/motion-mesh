provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      Project     = "motionmesh"
      Environment = "benchmark"
      ManagedBy   = "terraform"
    }
  }
}

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "motionmesh-terraform-state-benchmark-425456324653"
    key            = "benchmark/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "motionmesh-terraform-state-lock-benchmark"
    encrypt        = true
  }
}

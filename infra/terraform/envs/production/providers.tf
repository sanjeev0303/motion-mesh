provider "aws" {
  region = "ap-south-1"
  default_tags {
    tags = {
      Project     = "motionmesh"
      Environment = "production"
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
}

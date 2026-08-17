module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = var.cluster_version

  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true

  vpc_id     = var.vpc_id
  subnet_ids = var.subnet_ids

  enable_irsa = true

  cluster_addons = {
    eks-pod-identity-agent = {
      most_recent = true
    }
    amazon-cloudwatch-observability = {
      most_recent = true
    }
  }

  eks_managed_node_group_defaults = {
    ami_type       = "AL2023_x86_64_STANDARD"
    instance_types = ["m7i-flex.large"]
    disk_size      = 20
    iam_role_additional_policies = {
      CloudWatchAgentServerPolicy = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
    }
  }

  eks_managed_node_groups = {
    system = {
      min_size     = 2
      max_size     = 3
      desired_size = 2

      instance_types = ["m7i-flex.large"]
      capacity_type  = "SPOT"

      labels = {
        Environment = var.environment
        NodeGroup   = "system"
      }
    }

    api = {
      min_size     = 1
      max_size     = 2
      desired_size = 1

      instance_types = ["m7i-flex.large"]
      capacity_type  = "SPOT"

      labels = {
        Environment = var.environment
        NodeGroup   = "api"
      }
    }

    workers = {
      min_size     = 1
      max_size     = 2
      desired_size = 1

      instance_types = ["m7i-flex.large"]
      capacity_type  = "SPOT"

      labels = {
        Environment = var.environment
        NodeGroup   = "workers"
      }

      taints = [
        {
          key    = "workload"
          value  = "worker"
          effect = "NO_SCHEDULE"
        }
      ]
    }
  }

  enable_cluster_creator_admin_permissions = true

  tags = {
    Environment = var.environment
    Terraform   = "true"
  }
}

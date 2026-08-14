variable "environment" {
  description = "Environment name"
  type        = string
  default     = "benchmark"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.1.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "cluster_version" {
  description = "EKS cluster version"
  type        = string
  default     = "1.35"
}

variable "aurora_engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.8"
}

variable "aurora_instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.r6g.large"
}

variable "media_domain_name" {
  description = "The custom media domain name (e.g., media.motionmesh.co.in)"
  type        = string

  validation {
    condition     = length(var.media_domain_name) > 0
    error_message = "media_domain_name must not be empty."
  }
}

variable "acm_certificate_arn" {
  description = "The ARN of the ACM certificate to use for the custom domain"
  type        = string

  validation {
    condition     = startswith(var.acm_certificate_arn, "arn:aws:acm:")
    error_message = "acm_certificate_arn must start with 'arn:aws:acm:'."
  }
}

variable "route53_zone_id" {
  description = "Route53 Hosted Zone ID for alias records"
  type        = string

  validation {
    condition     = startswith(var.route53_zone_id, "Z")
    error_message = "route53_zone_id must start with 'Z'."
  }
}

variable "api_domain_name" {
  description = "The custom API domain name (e.g., api.motionmesh.co.in)"
  type        = string

  validation {
    condition     = length(var.api_domain_name) > 0
    error_message = "api_domain_name must not be empty."
  }
}

variable "dns_domain_name" {
  description = "The base DNS domain name for ExternalDNS (e.g., motionmesh.co.in)"
  type        = string

  validation {
    condition     = length(var.dns_domain_name) > 0
    error_message = "dns_domain_name must not be empty."
  }
}

variable "allowed_cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["https://app.motionmesh.co.in"]
}


variable "cookie_domain" {
  description = "The domain for cookies (e.g., .motionmesh.co.in)"
  type        = string

  validation {
    condition     = length(var.cookie_domain) > 0
    error_message = "cookie_domain must not be empty."
  }
}

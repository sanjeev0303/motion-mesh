variable "environment" {
  description = "Environment name (e.g., benchmark, production)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where Aurora will be deployed"
  type        = string
}

variable "subnet_ids" {
  description = "A list of subnet IDs where the Aurora cluster will be provisioned"
  type        = list(string)
}

variable "database_name" {
  description = "Name of the initial database to create"
  type        = string
  default     = "motionmesh"
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version"
  type        = string
  default     = "15.4"
}

variable "instance_class" {
  description = "Aurora instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "allowed_security_group_ids" {
  description = "List of security group IDs allowed to access Aurora"
  type        = list(string)
  default     = []
}

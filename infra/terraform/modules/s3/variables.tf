variable "environment" {
  description = "Environment name"
  type        = string
}

variable "allowed_cors_origins" {
  description = "List of allowed CORS origins"
  type        = list(string)
  default     = ["*"]
}

variable "bucket_name" {
  description = "Name of the S3 bucket"
  type        = string
}

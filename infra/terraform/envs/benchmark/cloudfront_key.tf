resource "tls_private_key" "cloudfront_signing" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "aws_secretsmanager_secret" "cloudfront_signing" {
  name = "motionmesh/${var.environment}/cloudfront-signing"
}

resource "aws_secretsmanager_secret_version" "cloudfront_signing" {
  secret_id = aws_secretsmanager_secret.cloudfront_signing.id
  secret_string = jsonencode({
    key_id      = module.cloudfront.cloudfront_public_key_id
    private_key = tls_private_key.cloudfront_signing.private_key_pem
  })
}

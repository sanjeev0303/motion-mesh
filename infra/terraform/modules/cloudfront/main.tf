module "cloudfront" {
  source  = "terraform-aws-modules/cloudfront/aws"
  version = "~> 3.0"

  comment             = "CloudFront for MotionMesh ${var.environment}"
  enabled             = true
  is_ipv6_enabled     = true
  price_class         = "PriceClass_100"
  retain_on_delete    = false
  wait_for_deployment = false

  aliases = var.media_domain_name != "" ? [var.media_domain_name] : []

  viewer_certificate = var.acm_certificate_arn != "" ? {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
    } : {
    cloudfront_default_certificate = true
  }

  create_origin_access_control = true
  origin_access_control = {
    s3_oac = {
      description      = "CloudFront access to S3"
      origin_type      = "s3"
      signing_behavior = "always"
      signing_protocol = "sigv4"
    }
  }

  origin = {
    s3_origin = {
      domain_name           = var.s3_bucket_domain
      origin_access_control = "s3_oac"
    }
  }

  default_cache_behavior = {
    target_origin_id       = "s3_origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    use_forwarded_values   = false
    trusted_key_groups     = [aws_cloudfront_key_group.this.id]

    # Signed cookies are validated at the edge. Do not forward them to S3.
    forwarded_values = {
      query_string = false
      cookies = {
        forward = "none"
      }
    }
  }

  tags = {
    Environment = var.environment
  }
}

resource "aws_cloudfront_public_key" "this" {
  comment     = "MotionMesh CloudFront Signer - ${var.environment}"
  encoded_key = var.cloudfront_signing_public_key
  name        = "motionmesh-signer-${var.environment}"
}

resource "aws_cloudfront_key_group" "this" {
  comment = "MotionMesh Signer Key Group - ${var.environment}"
  items   = [aws_cloudfront_public_key.this.id]
  name    = "motionmesh-key-group-${var.environment}"
}

resource "aws_route53_record" "media" {
  count = var.media_domain_name != "" && var.route53_zone_id != "" ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.media_domain_name
  type    = "A"

  alias {
    name                   = module.cloudfront.cloudfront_distribution_domain_name
    zone_id                = module.cloudfront.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

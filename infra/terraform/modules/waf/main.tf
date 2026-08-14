resource "aws_wafv2_web_acl" "this" {
  name        = "motionmesh-${var.environment}-waf"
  description = "WAF for MotionMesh ALB"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "MotionMeshWAFMetric"
    sampled_requests_enabled   = true
  }

  tags = {
    Environment = var.environment
  }
}

# The association will be done via Kubernetes Ingress annotation:
# alb.ingress.kubernetes.io/wafv2-acl-arn: <waf_arn>

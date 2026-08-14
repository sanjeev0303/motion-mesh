# We can use Helm to deploy kube-prometheus-stack if Helm provider is configured,
# but for basic AWS monitoring we can configure CloudWatch container insights.
# EKS Addons can also be configured here.

resource "aws_eks_addon" "cloudwatch_observability" {
  cluster_name                = var.cluster_name
  addon_name                  = "amazon-cloudwatch-observability"
  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "PRESERVE"
}

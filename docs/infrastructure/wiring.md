# Motionmesh AWS Infrastructure Wiring

This document explains how configuration and secrets flow from AWS Terraform creation down into the Kubernetes workloads.

## The Problem

Historically, local endpoints like `localhost:5432` or hardcoded external endpoints were bundled inside the app configuration or manifests. This meant the app was loosely coupled from the infrastructure that hosted it.

## The Solution: External Secrets & Pod Identity

We use **Terraform** as the absolute source of truth. Terraform provisions resources (Aurora, Redis, S3, CloudFront) and pushes the generated endpoints and credentials directly into **AWS Secrets Manager**.

**Kubernetes** then fetches these values natively.

### Architecture Flow

1. **Terraform provisions Aurora**: AWS RDS automatically creates a Secret containing the `username`, `password`, `host`, `port`, and `dbname`.
2. **Terraform provisions Redis & CloudFront**: Terraform pushes custom secrets into Secrets Manager (e.g. `motionmesh/production/redis`).
3. **External Secrets Operator (ESO)**: ESO runs in the cluster and assumes an IAM role via Pod Identity. It reads the Secrets from AWS.
4. **Templated `ExternalSecret`**: ESO merges the JSON properties from multiple AWS Secrets and templates them into standard connection strings (e.g. `postgres://...`).
5. **Kubernetes Secret**: ESO outputs a native K8s Secret `motionmesh-secrets` containing `DATABASE_URL`, `REDIS_URL`, etc.
6. **API / Worker Pods**: The pods map `envFrom: secretRef: motionmesh-secrets` and start up immediately connected to the provisioned infrastructure.

### EKS Pod Identity (IAM)

We use EKS Pod Identity for fine-grained AWS access:
- **`motionmesh-api` IAM Role**: Attached to the `motionmesh-api` ServiceAccount. Has policies to Read/Write S3.
- **`motionmesh-worker` IAM Role**: Attached to the `motionmesh-worker` ServiceAccount. Has policies to Read/Write/Delete S3.
- **`aws-load-balancer-controller` IAM Role**: Attached to the controller ServiceAccount via IRSA. Has policies to manage ALBs and WAF associations.

### WAF and Ingress

1. Terraform creates the WAF WebACL.
2. The `deploy-aws.sh` script templates the WAF ARN into the Kubernetes Ingress resource (`alb.ingress.kubernetes.io/wafv2-acl-arn: <waf_arn>`).
3. The AWS Load Balancer Controller creates the ALB and automatically associates the WAF to it.

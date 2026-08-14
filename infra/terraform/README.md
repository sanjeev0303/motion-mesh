# Motionmesh Infrastructure (Terraform)

This directory contains the Infrastructure-as-Code (IaC) configuration for deploying Motionmesh to AWS. It is structured to support isolated environments and modular components for high scalability.

## Directory Structure

- **`envs/`**: Environment-specific configurations (e.g., `benchmark`, `production`). Each environment maintains its own state and variable configurations. Use these directories to run `terraform init`, `plan`, and `apply`.
  - `envs/benchmark/`: Configured specifically for high-throughput AWS benchmarking (targeting 16,667 RPS and 100k CCU).
  - `envs/production/`: Standard production configuration.
- **`modules/`**: Reusable Terraform modules.
  - `vpc/`: Network topology, subnets, NAT, Flow Logs, and VPC endpoints.
  - `eks/`: Elastic Kubernetes Service cluster and managed node groups.
  - `rds/`: Aurora PostgreSQL configuration.
  - `elasticache/`: Redis cluster setup.
  - `s3/`: Bucket configurations for video uploads, transcodes, and caching.

## Usage

To provision the benchmark environment, navigate to the environment directory and run the standard Terraform workflow:

```bash
cd envs/benchmark
terraform init
terraform plan
terraform apply
```

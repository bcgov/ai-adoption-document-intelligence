# Azure Infrastructure

Terraform-based infrastructure for provisioning Azure resources required by the Document Intelligence platform.

## Resources Provisioned

| Resource | Purpose |
|----------|---------|
| Resource Group | Container for all resources |
| VNet Subnets (PE + APIM) | Created in existing bcgov VNet |
| NSGs | Network security for PE and APIM subnets |
| Document Intelligence (S0) | OCR and document processing |
| Storage Account (Standard LRS) | Document blob storage |
| AI Foundry Hub (AIServices) | Multi-model LLM access (OpenAI, Mistral, Cohere) |
| APIM (Developer tier) | API gateway with VNet injection |
| Key Vault | Secrets management |
| Log Analytics + App Insights | Monitoring and diagnostics |
| Private Endpoints | Secure connectivity to PaaS services |

## Prerequisites

- Azure CLI installed and logged in (`az login`)
- Terraform >= 1.12.0
- Access to a bcgov Azure subscription with an existing VNet

## Quick Start

### 1. Initialize State Backend (one-time)

```bash
cd infra/scripts
./init-backend.sh
```

### 2. Configure Variables

Edit `infra/terraform.tfvars` with your subscription details:

```hcl
subscription_id     = "<your-subscription-id>"
vnet_name           = "<existing-vnet-name>"
vnet_resource_group = "<networking-rg>"
pe_subnet_cidr      = "10.x.x.0/27"
apim_subnet_cidr    = "10.x.x.32/27"
apim_publisher_email = "your@email.com"
```

### 3. Deploy

```bash
cd infra/scripts
./deploy.sh plan     # Preview changes
./deploy.sh apply    # Deploy resources
./deploy.sh output   # View outputs
```

### 4. Teardown

```bash
cd infra/scripts
./teardown.sh
```

## Architecture

```
Your App (OpenShift) --> APIM Gateway (public, external mode)
                              |
                         VNet Injection
                              |
                    +---------+---------+
                    |         |         |
              Doc Intel   AI Foundry  Storage
              (PE)        (PE)        (public)
```

- **APIM** is deployed in External VNet mode — gateway is publicly accessible, but outbound traffic routes through the VNet
- **Document Intelligence** and **AI Foundry** are private-endpoint-only (no public access)
- **Storage** has public access (bcgov Landing Zone allows this for storage)
- **APIM authenticates** to backends via managed identity (no API keys passed through)

## APIM Routing

| Path | Backend Service |
|------|----------------|
| `/documentintelligence/*` | Azure Document Intelligence |
| `/openai/*` | AI Foundry Hub (all models) |
| `/storage/*` | Azure Blob Storage |

Authenticate with: `api-key: <subscription-key>` header.

## AI Foundry Model Deployments

Configure models in `terraform.tfvars`:

```hcl
model_deployments = [
  { name = "gpt-4o",                 version = "2024-11-20", capacity = 10 },
  { name = "text-embedding-3-small", version = "1",          capacity = 10 },
  { name = "Mistral-Large-3",        version = "1",          capacity = 10 },
]
```

Model format is auto-detected from the name prefix:
- `gpt-*`, `o1`, `o3-*`, `text-embedding-*` → OpenAI format
- `mistral-*`, `Mistral-*`, `codestral-*` → Mistral AI format
- `cohere-*`, `Cohere-*` → Cohere format

## Estimated Monthly Cost (Dev)

| Resource | ~Cost |
|----------|-------|
| APIM Developer | ~$50 |
| Private Endpoints (4x) | ~$29 |
| DI, Storage, OpenAI, KV, LAW | ~$5-20 (usage-based) |
| **Total** | **~$85-100** |

## bcgov Landing Zone Notes

- All PaaS services use private endpoints (Landing Zone policy manages DNS zone groups)
- NSGs attached at subnet creation via `azapi_resource` (policy requirement)
- Canada Central region
- Key Vault has purge protection enabled
- Storage uses TLS 1.2 minimum
- RBAC preferred over local auth/access policies

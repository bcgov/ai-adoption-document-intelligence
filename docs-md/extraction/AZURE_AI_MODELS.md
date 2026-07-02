# Azure AI Models Availability

Last updated: 2026-04-04

## Currently Deployed Models

| Model | Version | Capacity | Region |
|-------|---------|----------|--------|
| gpt-4o | 2024-11-20 | 10K TPM | Canada East |
| gpt-5.4-mini | 2026-03-17 | 10K TPM | Canada East |
| text-embedding-3-small | 1 | 10K TPM | Canada East |

## Complete OpenAI Model List

All models below are available via both `OpenAI` and `AIServices` resource kinds unless noted. Region availability differences are called out per model.

### GPT-5 Family

| Model | Version(s) | Region | Notes |
|-------|-----------|--------|-------|
| gpt-5.4-mini | 2026-03-17 | Both | Newest model available |
| gpt-5.1 | 2025-11-13 | Both | |
| gpt-5.1-chat | 2025-11-13 | Both | Chat-optimized |
| gpt-5.1-codex | 2025-11-13 | Both | Code-focused |
| gpt-5.1-codex-mini | 2025-11-13 | Both | Code-focused, small |
| gpt-5-pro | 2025-10-06 | Both | Premium tier |
| gpt-5 | 2025-08-07 | Both | |
| gpt-5-chat | 2025-08-07, 2025-10-03 | Both | Chat-optimized |
| gpt-5-codex | 2025-09-15 | Both | Code-focused |
| gpt-5-mini | 2025-08-07 | Both | |
| gpt-5-nano | 2025-08-07 | Canada East only | Smallest GPT-5 |

### GPT-4.1 Family

| Model | Version | Region | Notes |
|-------|---------|--------|-------|
| gpt-4.1 | 2025-04-14 | Both | Commented out in terraform.tfvars |
| gpt-4.1-mini | 2025-04-14 | Both | Commented out in terraform.tfvars |
| gpt-4.1-nano | 2025-04-14 | Both | |

### GPT-4o Family

| Model | Version(s) | Region | Notes |
|-------|-----------|--------|-------|
| gpt-4o | 2024-05-13, 2024-08-06, 2024-11-20 | Both | 2024-11-20 currently deployed |
| gpt-4o-mini | 2024-07-18 | Both | |
| gpt-4o-audio-preview | 2024-12-17 | Both | Audio input/output |

### GPT-4 (Legacy)

| Model | Version(s) | Region | Notes |
|-------|-----------|--------|-------|
| gpt-4 | 0613, 1106-Preview, turbo-2024-04-09 | Canada East: all 3; Canada Central: 0613 only | |
| gpt-4-32k | 0613 | Both | |

### GPT-3.5 (Legacy)

| Model | Version(s) | Region | Notes |
|-------|-----------|--------|-------|
| gpt-35-turbo | 0613, 1106, 0125 | Canada East: all 3; Canada Central: 0125 only | |
| gpt-35-turbo-16k | 0613 | Canada East only | |

### Reasoning Models

| Model | Version | Region |
|-------|---------|--------|
| o4-mini | 2025-04-16 | Both |
| o3-mini | 2025-01-31 | Both |
| o1 | 2024-12-17 | Both |

### Real-Time / Streaming (Canada Central only)

| Model | Version(s) |
|-------|-----------|
| gpt-realtime | 2025-08-28 |
| gpt-realtime-mini | 2025-10-06, 2025-12-15 |
| gpt-realtime-1.5 | 2026-02-23 |

### Speech / Transcription

| Model | Version(s) | Region |
|-------|-----------|--------|
| whisper | 001 | Both |
| gpt-4o-transcribe | 2025-03-20 | Canada Central only |
| gpt-4o-mini-transcribe | 2025-03-20, 2025-12-15 | Canada Central only |
| gpt-4o-transcribe-diarize | 2025-10-15 | Canada Central only |

### Embedding Models

| Model | Version | Region | Notes |
|-------|---------|--------|-------|
| text-embedding-3-small | 1 | Both | Currently deployed |
| text-embedding-3-large | 1 | Both | Higher dimension |
| text-embedding-ada-002 | 2 | Both | Legacy |

### Legacy Fine-Tuning Base Models

| Model | Version | Region |
|-------|---------|--------|
| ada | 1 | Both |
| babbage | 1 | Both |
| curie | 1 | Both |
| davinci | 1 | Both |

## Available Third-Party Models (AIServices kind)

These are available via Azure AI Foundry (Model-as-a-Service). Both Canada East and Canada Central have the same catalog.

### Alibaba

| Model | Version |
|-------|---------|
| qwen3-32b | 1 |

### AI21 Labs

| Model | Version |
|-------|---------|
| AI21-Jamba-1.5-Large | 1 |
| AI21-Jamba-1.5-Mini | 1 |
| AI21-Jamba-Instruct | 1 |

### Black Forest Labs (Image Generation)

| Model | Version |
|-------|---------|
| FLUX-1.1-pro | 1 |
| FLUX.1-Kontext-pro | 1 |
| FLUX.2-pro | 1 |

### Cohere

| Model | Version | Type |
|-------|---------|------|
| cohere-command-a | 1 | Chat |
| Cohere-command-r | 1 | Chat |
| Cohere-command-r-08-2024 | 1 | Chat |
| Cohere-command-r-plus | 1 | Chat |
| Cohere-command-r-plus-08-2024 | 1 | Chat |
| embed-v-4-0 | 1 | Embedding |
| Cohere-embed-v3-english | 1 | Embedding |
| Cohere-embed-v3-multilingual | 1 | Embedding |
| Cohere-rerank-v4.0-fast | 1 | Reranking |
| Cohere-rerank-v4.0-pro | 1 | Reranking |

### DeepSeek

| Model | Version |
|-------|---------|
| DeepSeek-R1 | 1 |
| DeepSeek-R1-0528 | 1 |
| DeepSeek-V3 | 1 |
| DeepSeek-V3-0324 | 1 |
| DeepSeek-V3.1 | 1 |
| DeepSeek-V3.2 | 1 |
| DeepSeek-V3.2-Speciale | 1 |

### Meta Llama

| Model | Versions | Notes |
|-------|----------|-------|
| Llama-4-Maverick-17B-128E-Instruct-FP8 | 1 | Llama 4, MoE |
| Llama-4-Scout-17B-16E-Instruct | 1 | Llama 4, MoE |
| Meta-Llama-3.1-405B-Instruct | 1 | Largest Llama 3 |
| Meta-Llama-3.1-70B-Instruct | 1-4 | |
| Meta-Llama-3.1-8B-Instruct | 1-5 | |
| Llama-3.3-70B-Instruct | 1-5, 9 | |
| Llama-3.2-90B-Vision-Instruct | 1-3 | Vision |
| Llama-3.2-11B-Vision-Instruct | 1-2 | Vision |
| Meta-Llama-3-70B-Instruct | 6-9 | |
| Meta-Llama-3-8B-Instruct | 6-9 | |

### Microsoft Phi

| Model | Versions | Notes |
|-------|----------|-------|
| Phi-4 | 2-7 | Latest Phi |
| Phi-4-reasoning | 1 | Reasoning variant |
| Phi-4-mini-reasoning | 1 | Small reasoning |
| Phi-4-mini-instruct | 1 | |
| Phi-4-multimodal-instruct | 1 | Vision + text |
| Phi-3.5-MoE-instruct | 2-5 | Mixture of experts |
| Phi-3.5-vision-instruct | 1-2 | Vision |
| Phi-3.5-mini-instruct | 1-4, 6 | |
| Phi-3-medium-128k-instruct | 3-7 | 128K context |
| Phi-3-medium-4k-instruct | 3-6 | |
| Phi-3-mini-128k-instruct | 10-13 | |
| Phi-3-mini-4k-instruct | 10-15 | |
| Phi-3-small-128k-instruct | 3-5 | |
| Phi-3-small-8k-instruct | 3-5 | |

### Microsoft Other

| Model | Version | Notes |
|-------|---------|-------|
| MAI-DS-R1 | 1 | Microsoft DeepSeek-R1 distillation |

### Mistral AI

| Model | Version | Notes |
|-------|---------|-------|
| Mistral-Large-3 | 1 | Latest large model |
| Mistral-Large-2411 | 2 | |
| Mistral-large-2407 | 1 | |
| Mistral-large | 1 | |
| mistral-medium-2505 | 1 | |
| mistral-small-2503 | 1 | |
| Mistral-small | 1 | |
| Mistral-Nemo | 1 | |
| Ministral-3B | 1 | Smallest Mistral |
| Codestral-2501 | 2 | Code-focused |
| mistral-document-ai-2505 | 1 | Document processing (see restrictions below) |
| mistral-document-ai-2512 | 1 | Document processing (see restrictions below) |

### MoonshotAI

| Model | Version |
|-------|---------|
| Kimi-K2-Thinking | 1 |
| Kimi-K2.5 | 1 |

### OpenAI-OSS (Open Source)

| Model | Version |
|-------|---------|
| gpt-oss-120b | 1 |
| gpt-oss-20b | 11 |

### xAI (Grok)

| Model | Version | Notes |
|-------|---------|-------|
| grok-3 | 1 | |
| grok-3-mini | 1 | |
| grok-4-1-fast-reasoning | 1 | Reasoning mode |
| grok-4-1-fast-non-reasoning | 1 | Standard mode |
| grok-4-fast-reasoning | 1 | Reasoning mode |
| grok-4-fast-non-reasoning | 1 | Standard mode |

### Core42

| Model | Versions | Notes |
|-------|----------|-------|
| jais-30b-chat | 1-3 | Arabic-focused |

## Known Limitations: Third-Party Models on AIServices

### Mistral OCR / Document AI — Not Usable in Canadian Regions (April 2026)

**Status**: Models appear in the Canada East catalog and deploy successfully as GlobalStandard SKU on an AIServices account, but **inference does not work**.

**Root cause**: Mistral OCR uses a provider-specific API path (`/v1/ocr`) that is only exposed on serverless MaaS endpoints (`*.models.ai.azure.com`). The AIServices unified endpoint (`*.services.ai.azure.com`) only supports OpenAI-compatible API surfaces (`/openai/deployments/<name>/chat/completions`). The deployment resource is created, but there is no route to call the OCR inference endpoint.

**What was tried** (2026-04-04):
1. Deployed `mistral-document-ai-2512` via Terraform as GlobalStandard on AIServices in Canada East — provisioning succeeded
2. Attempted `/v1/ocr` on `services.ai.azure.com` — 404
3. Attempted `/openai/deployments/mistral-document-ai-2512/v1/ocr` — 400
4. Attempted `/models/mistral-document-ai-2512/v1/ocr` — 500
5. Attempted `/providers/mistral/azure/ocr` — 500
6. All paths returned alternating 404/500 errors, confirming the endpoint does not support the Mistral OCR path

**Options if Mistral OCR is needed**:
- Deploy as serverless MaaS in a US region (East US, East US 2, etc.) — but documents leave Canada for inference, which may violate BCGov data residency requirements for PII-containing forms
- Wait for Microsoft to add `/v1/ocr` support to the `services.ai.azure.com` unified endpoint
- Use Azure Document Intelligence (already deployed in Canada Central) + GPT models for post-processing instead

**This limitation likely applies to all non-OpenAI models that use provider-specific API paths** (not just Mistral OCR). Chat-compatible third-party models (DeepSeek, Llama, etc.) should work via the standard `/openai/deployments/<name>/chat/completions` path.

## BCGov Restrictions

- **Data residency**: Only Canadian regions (Canada East + Canada Central) are used. Model availability is limited to what Microsoft has deployed there.
- **Network**: Public access is disabled on the AI Foundry account. All traffic routes through private endpoints via APIM.
- **RAI policy**: `Microsoft.DefaultV2` content filtering is applied to all model deployments. Safety filters cannot be disabled.
- **Authentication**: Managed identity only (local auth disabled). APIM acts as the gateway with subscription key authentication.
- **Capacity**: Each model deployment is configured at 10K TPM (GlobalStandard SKU).

## Deploying Additional Models

Models are managed via Terraform in `infra/terraform.tfvars`. To add a model, add an entry to the `model_deployments` list:

```hcl
model_deployments = [
  { name = "gpt-4o",                 version = "2024-11-20", capacity = 10 },
  { name = "text-embedding-3-small", version = "1",          capacity = 10 },
  # Add new model here:
  { name = "gpt-4.1-mini",           version = "2025-04-14", capacity = 10 },
]
```

The Foundry Terraform module auto-detects the model format based on name prefix (`gpt-` -> OpenAI, `Mistral`/`codestral` -> Mistral AI, `Cohere`/`cohere-` -> Cohere).

Run `terraform apply` from the `infra/` directory to deploy.

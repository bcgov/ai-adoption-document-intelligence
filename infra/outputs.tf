# Outputs useful for configuring the application .env files

output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.this.name
}

# --- APIM ---
output "apim_gateway_url" {
  description = "APIM gateway URL (use this as the base URL for API calls)"
  value       = module.apim.apim_gateway_url
}

output "apim_subscription_key" {
  description = "APIM subscription key (use as api-key header)"
  value       = module.apim.apim_subscription_primary_key
  sensitive   = true
}

# --- Document Intelligence (direct access, if needed) ---
output "document_intelligence_endpoint" {
  description = "Document Intelligence endpoint"
  value       = module.services.document_intelligence_endpoint
}

# --- AI Foundry ---
output "ai_foundry_endpoint" {
  description = "AI Foundry Hub endpoint"
  value       = module.foundry.ai_foundry_endpoint
}

# --- Storage ---
output "storage_account_name" {
  description = "Storage account name"
  value       = module.services.storage_account_name
}

output "storage_blob_endpoint" {
  description = "Storage blob endpoint"
  value       = module.services.storage_account_blob_endpoint
}

output "storage_connection_string" {
  description = "Storage account connection string"
  value       = module.services.storage_account_connection_string
  sensitive   = true
}

# --- Storage (PROD) ---
output "prod_storage_account_name" {
  description = "PROD storage account name"
  value       = module.services.prod_storage_account_name
}

output "prod_storage_blob_endpoint" {
  description = "PROD storage blob endpoint"
  value       = module.services.prod_storage_account_blob_endpoint
}

output "prod_storage_container_name" {
  description = "PROD storage container name"
  value       = module.services.prod_storage_container_name
}

output "prod_storage_connection_string" {
  description = "PROD storage account connection string"
  value       = module.services.prod_storage_account_connection_string
  sensitive   = true
}

output "prod_storage_account_key" {
  description = "PROD storage account primary access key"
  value       = module.services.prod_storage_account_access_key
  sensitive   = true
}

# --- Key Vault ---
output "key_vault_name" {
  description = "Key Vault name"
  value       = module.services.key_vault_name
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = module.services.key_vault_uri
}

# --- Summary for .env configuration ---
output "env_config" {
  description = "Environment variables for application configuration"
  value       = <<-EOT
    # APIM Gateway (recommended - routes through APIM to all services)
    APIM_GATEWAY_URL=${module.apim.apim_gateway_url}
    # Use: terraform output -raw apim_subscription_key
    # APIM_SUBSCRIPTION_KEY=<run above command>

    # Azure Document Intelligence (via APIM: $${APIM_GATEWAY_URL}/documentintelligence/...)
    AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=${module.services.document_intelligence_endpoint}

    # Azure OpenAI / AI Foundry (via APIM: $${APIM_GATEWAY_URL}/openai/...)
    AZURE_OPENAI_ENDPOINT=${module.foundry.ai_foundry_endpoint}

    # Azure Storage
    AZURE_STORAGE_ACCOUNT_NAME=${module.services.storage_account_name}
    AZURE_STORAGE_CONTAINER_NAME=${var.storage_container}
    # Use: terraform output -raw storage_connection_string
    # AZURE_STORAGE_CONNECTION_STRING=<run above command>

    # Azure Storage (PROD)
    AZURE_STORAGE_ACCOUNT_NAME=${module.services.prod_storage_account_name}
    AZURE_STORAGE_CONTAINER_NAME=${var.prod_storage_container}
    # Use: terraform output -raw prod_storage_connection_string
    # AZURE_STORAGE_CONNECTION_STRING=<run above command>
    # Use: terraform output -raw prod_storage_account_key
    # AZURE_STORAGE_ACCOUNT_KEY=<run above command>

    # Key Vault
    KEY_VAULT_NAME=${module.services.key_vault_name}
    KEY_VAULT_URI=${module.services.key_vault_uri}
  EOT
}

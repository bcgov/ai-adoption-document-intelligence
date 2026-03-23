output "log_analytics_workspace_id" {
  description = "Resource ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.this.id
}

output "key_vault_id" {
  description = "Resource ID of the Key Vault"
  value       = module.key_vault.resource_id
}

output "key_vault_uri" {
  description = "URI of the Key Vault"
  value       = module.key_vault.resource_uri
}

output "key_vault_name" {
  description = "Name of the Key Vault"
  value       = module.key_vault.name
}

output "storage_account_id" {
  description = "Resource ID of the Storage Account"
  value       = azurerm_storage_account.this.id
}

output "storage_account_name" {
  description = "Name of the Storage Account"
  value       = azurerm_storage_account.this.name
}

output "storage_account_blob_endpoint" {
  description = "Blob endpoint of the Storage Account"
  value       = azurerm_storage_account.this.primary_blob_endpoint
}

output "storage_account_connection_string" {
  description = "Connection string for the Storage Account"
  value       = azurerm_storage_account.this.primary_connection_string
  sensitive   = true
}

output "storage_account_access_key" {
  description = "Primary access key for the Storage Account"
  value       = azurerm_storage_account.this.primary_access_key
  sensitive   = true
}

output "document_intelligence_id" {
  description = "Resource ID of the Document Intelligence account"
  value       = module.document_intelligence.resource_id
}

output "document_intelligence_endpoint" {
  description = "Endpoint of the Document Intelligence account"
  value       = module.document_intelligence.endpoint
}

output "document_intelligence_name" {
  description = "Name of the Document Intelligence account"
  value       = module.document_intelligence.name
}

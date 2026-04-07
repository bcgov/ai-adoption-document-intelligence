output "apim_id" {
  description = "Resource ID of the APIM instance"
  value       = azurerm_api_management.this.id
}

output "apim_name" {
  description = "Name of the APIM instance"
  value       = azurerm_api_management.this.name
}

output "apim_gateway_url" {
  description = "Gateway URL of the APIM instance"
  value       = azurerm_api_management.this.gateway_url
}

output "apim_principal_id" {
  description = "Principal ID of the APIM managed identity"
  value       = azurerm_api_management.this.identity[0].principal_id
}

output "apim_subscription_primary_key" {
  description = "Primary subscription key for the default product"
  value       = azurerm_api_management_subscription.default.primary_key
  sensitive   = true
}

output "apim_subscription_secondary_key" {
  description = "Secondary subscription key for the default product"
  value       = azurerm_api_management_subscription.default.secondary_key
  sensitive   = true
}

output "ai_foundry_id" {
  description = "Resource ID of the AI Foundry Hub"
  value       = azapi_resource.ai_foundry.id
}

output "ai_foundry_endpoint" {
  description = "Endpoint of the AI Foundry Hub"
  value       = azapi_resource.ai_foundry.output.properties.endpoint
}

output "ai_foundry_principal_id" {
  description = "Principal ID of the AI Foundry Hub managed identity"
  value       = azapi_resource.ai_foundry.output.identity.principalId
}

output "ai_foundry_name" {
  description = "Name of the AI Foundry Hub"
  value       = azapi_resource.ai_foundry.name
}

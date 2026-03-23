output "pe_subnet_id" {
  description = "Resource ID of the private endpoint subnet"
  value       = azapi_resource.pe_subnet.id
}

output "apim_subnet_id" {
  description = "Resource ID of the APIM subnet"
  value       = azapi_resource.apim_subnet.id
}

output "vnet_id" {
  description = "Resource ID of the existing virtual network"
  value       = data.azurerm_virtual_network.this.id
}

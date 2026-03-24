variable "name_prefix" {
  description = "Prefix for resource names (e.g., doc-intel-dev)"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "apim_subnet_id" {
  description = "Subnet ID for APIM VNet injection"
  type        = string
  default     = ""
}

variable "vnet_injection_enabled" {
  description = "Enable VNet injection for APIM (requires subnet)"
  type        = bool
  default     = false
}

variable "publisher_name" {
  description = "APIM publisher name"
  type        = string
}

variable "publisher_email" {
  description = "APIM publisher email"
  type        = string
}

variable "ai_foundry_endpoint" {
  description = "Endpoint of the AI Foundry Hub"
  type        = string
}

variable "document_intelligence_endpoint" {
  description = "Endpoint of the Document Intelligence account"
  type        = string
}

variable "storage_blob_endpoint" {
  description = "Blob endpoint of the Storage Account"
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID for diagnostics"
  type        = string
}

variable "public_ip_id" {
  description = "Public IP address ID for APIM (required for stv2 External VNet injection)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

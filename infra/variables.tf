# -----------------------------------------------------------------------------
# General
# -----------------------------------------------------------------------------
variable "app_name" {
  description = "Application name used in resource naming"
  type        = string
  default     = "doc-intel"
}

variable "app_env" {
  description = "Environment name (dev, test, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Azure region for all resources"
  type        = string
  default     = "Canada Central"
}

variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "tenant_id" {
  description = "Azure AD tenant ID"
  type        = string
  default     = "6fdb5200-3d0d-4a8a-b036-d3685e359adc" # bcgov
}

variable "use_oidc" {
  description = "Use OIDC authentication (for CI/CD)"
  type        = bool
  default     = false
}

variable "client_id" {
  description = "Service principal client ID (for OIDC auth)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# -----------------------------------------------------------------------------
# Networking (existing VNet)
# -----------------------------------------------------------------------------
variable "vnet_name" {
  description = "Name of the existing virtual network"
  type        = string
}

variable "vnet_resource_group" {
  description = "Resource group of the existing virtual network"
  type        = string
}

variable "pe_subnet_cidr" {
  description = "CIDR for the private endpoint subnet (/27 recommended)"
  type        = string
}

variable "apim_subnet_cidr" {
  description = "CIDR for the APIM subnet (/27 recommended)"
  type        = string
}

variable "source_vnet_address_space" {
  description = "Address space of the source/tools VNet for NSG allow rules"
  type        = string
  default     = ""
}

# -----------------------------------------------------------------------------
# AI Foundry Hub
# -----------------------------------------------------------------------------
variable "ai_location" {
  description = "Azure region for AI Foundry Hub (may differ from location for model availability, e.g. Canada East)"
  type        = string
  default     = null
}

variable "model_deployments" {
  description = "List of model deployments on the AI Foundry Hub"
  type = list(object({
    name     = string
    version  = string
    capacity = number # TPM in thousands
  }))
  default = [
    { name = "gpt-4o", version = "2024-11-20", capacity = 10 },
    { name = "text-embedding-3-small", version = "1", capacity = 10 },
  ]
}

# -----------------------------------------------------------------------------
# Storage
# -----------------------------------------------------------------------------
variable "storage_container" {
  description = "Default blob container name"
  type        = string
  default     = "document-blobs"
}

# -----------------------------------------------------------------------------
# APIM
# -----------------------------------------------------------------------------
variable "apim_vnet_injection_enabled" {
  description = "Enable VNet injection for APIM (slower provisioning, enables private backend access)"
  type        = bool
  default     = false
}

variable "apim_publisher_name" {
  description = "APIM publisher name"
  type        = string
  default     = "Document Intelligence"
}

variable "apim_publisher_email" {
  description = "APIM publisher email"
  type        = string
  default     = "admin@example.com"
}

variable "name" {
  description = "Name of the AI Foundry Hub account"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "resource_group_id" {
  description = "Resource ID of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region for supporting resources (PEs, diagnostics)"
  type        = string
}

variable "ai_location" {
  description = "Azure region for AI Foundry Hub (may differ from location for model availability)"
  type        = string
  default     = null
}

variable "pe_subnet_id" {
  description = "Subnet ID for private endpoints"
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID for diagnostics"
  type        = string
}

variable "subscription_id" {
  description = "Azure subscription ID (for purge script)"
  type        = string
}

variable "model_deployments" {
  description = "List of model deployments on the AI Foundry Hub"
  type = list(object({
    name     = string
    version  = string
    capacity = number
  }))
  default = []
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

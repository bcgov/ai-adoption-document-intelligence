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

variable "pe_subnet_id" {
  description = "Subnet ID for private endpoints"
  type        = string
}

variable "storage_container" {
  description = "Default blob container name"
  type        = string
  default     = "document-blobs"
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

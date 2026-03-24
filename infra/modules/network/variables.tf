variable "name_prefix" {
  description = "Prefix for resource names (e.g., doc-intel-dev)"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "vnet_name" {
  description = "Name of the existing virtual network"
  type        = string
}

variable "vnet_resource_group" {
  description = "Resource group of the existing virtual network"
  type        = string
}

variable "pe_subnet_cidr" {
  description = "CIDR for the private endpoint subnet"
  type        = string
}

variable "apim_subnet_cidr" {
  description = "CIDR for the APIM subnet"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group for the route table (main RG, not networking RG)"
  type        = string
}

variable "source_vnet_address_space" {
  description = "Address space of the source/tools VNet for NSG allow rules (empty string to skip)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

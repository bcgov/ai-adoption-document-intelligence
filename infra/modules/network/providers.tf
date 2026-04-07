terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.38"
    }
    azapi = {
      source  = "Azure/azapi"
      version = ">= 2.5"
    }
  }
}

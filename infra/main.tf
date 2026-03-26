# Root Module - Azure Infrastructure for Document Intelligence
# Composes network, services, AI Foundry, and APIM modules.

locals {
  name_prefix = "${var.app_name}-${var.app_env}"
  tags = merge(var.tags, {
    app_name    = var.app_name
    environment = var.app_env
  })
}

# -----------------------------------------------------------------------------
# Resource Group
# -----------------------------------------------------------------------------
resource "azurerm_resource_group" "this" {
  name     = "${local.name_prefix}-rg"
  location = var.location
  tags     = local.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# Network (subnets + NSGs in existing VNet)
# -----------------------------------------------------------------------------
module "network" {
  source = "./modules/network"

  name_prefix               = local.name_prefix
  location                  = var.location
  resource_group_name       = azurerm_resource_group.this.name
  vnet_name                 = var.vnet_name
  vnet_resource_group       = var.vnet_resource_group
  pe_subnet_cidr            = var.pe_subnet_cidr
  apim_subnet_cidr          = var.apim_subnet_cidr
  source_vnet_address_space = var.source_vnet_address_space
  tags                      = local.tags
}

# -----------------------------------------------------------------------------
# Services (DI, Storage, Key Vault, Log Analytics)
# -----------------------------------------------------------------------------
module "services" {
  source = "./modules/services"

  name_prefix         = local.name_prefix
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  pe_subnet_id        = module.network.pe_subnet_id
  storage_container   = var.storage_container
  tags                = local.tags
}

# -----------------------------------------------------------------------------
# AI Foundry Hub (AIServices + model deployments)
# -----------------------------------------------------------------------------
module "foundry" {
  source = "./modules/foundry"

  name                       = "${local.name_prefix}-foundry"
  resource_group_name        = azurerm_resource_group.this.name
  resource_group_id          = azurerm_resource_group.this.id
  location                   = var.location
  ai_location                = var.ai_location
  pe_subnet_id               = module.network.pe_subnet_id
  log_analytics_workspace_id = module.services.log_analytics_workspace_id
  subscription_id            = var.subscription_id
  model_deployments          = var.model_deployments
  tags                       = local.tags
}

# -----------------------------------------------------------------------------
# Public IP for APIM (required for stv2 External VNet injection)
# -----------------------------------------------------------------------------
resource "azurerm_public_ip" "apim" {
  count = var.apim_vnet_injection_enabled ? 1 : 0

  name                = "${local.name_prefix}-apim-pip2"
  location            = var.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
  ip_version          = "IPv4"

  domain_name_label = "${local.name_prefix}-apim2"

  tags = local.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# APIM (Developer tier with VNet injection)
# -----------------------------------------------------------------------------
module "apim" {
  source = "./modules/apim"

  name_prefix                    = local.name_prefix
  location                       = var.location
  resource_group_name            = azurerm_resource_group.this.name
  apim_subnet_id                 = module.network.apim_subnet_id
  vnet_injection_enabled         = var.apim_vnet_injection_enabled
  public_ip_id                   = var.apim_vnet_injection_enabled ? azurerm_public_ip.apim[0].id : ""
  publisher_name                 = var.apim_publisher_name
  publisher_email                = var.apim_publisher_email
  ai_foundry_endpoint            = module.foundry.ai_foundry_endpoint
  document_intelligence_endpoint = module.services.document_intelligence_endpoint
  storage_blob_endpoint          = module.services.storage_account_blob_endpoint
  log_analytics_workspace_id     = module.services.log_analytics_workspace_id
  tags                           = local.tags
}

# -----------------------------------------------------------------------------
# RBAC: APIM managed identity → backend services
# Allows APIM to authenticate to backends via managed identity
# -----------------------------------------------------------------------------
resource "azurerm_role_assignment" "apim_to_ai_foundry" {
  scope                = module.foundry.ai_foundry_id
  role_definition_name = "Cognitive Services User"
  principal_id         = module.apim.apim_principal_id
}

resource "azurerm_role_assignment" "apim_to_docint" {
  scope                = module.services.document_intelligence_id
  role_definition_name = "Cognitive Services User"
  principal_id         = module.apim.apim_principal_id
}

resource "azurerm_role_assignment" "apim_to_storage" {
  scope                = module.services.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = module.apim.apim_principal_id
}

resource "azurerm_role_assignment" "apim_to_keyvault" {
  scope                = module.services.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = module.apim.apim_principal_id
}

# RBAC: AI Foundry managed identity → Storage (for model data access)
resource "azurerm_role_assignment" "foundry_to_storage" {
  scope                = module.services.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = module.foundry.ai_foundry_principal_id
}

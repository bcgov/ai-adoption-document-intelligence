# Services Module
# Creates Document Intelligence, Storage Account, Key Vault, and Log Analytics
# with private endpoints and Landing Zone compliance.

data "azurerm_client_config" "current" {}

# Random suffix for globally unique names
resource "random_string" "suffix" {
  length  = 4
  lower   = true
  upper   = false
  numeric = true
  special = false
}

locals {
  # Remove hyphens for storage/KV names (must be alphanumeric)
  name_short = substr(replace(var.name_prefix, "-", ""), 0, 10)
}

# -----------------------------------------------------------------------------
# Log Analytics Workspace
# -----------------------------------------------------------------------------
resource "azurerm_log_analytics_workspace" "this" {
  name                = "${var.name_prefix}-law"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = "PerGB2018"
  retention_in_days   = 30

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# Key Vault (using AVM)
# -----------------------------------------------------------------------------
module "key_vault" {
  source  = "Azure/avm-res-keyvault-vault/azurerm"
  version = "0.10.2"

  name                = "${local.name_short}kv${random_string.suffix.result}"
  location            = var.location
  resource_group_name = var.resource_group_name
  tenant_id           = data.azurerm_client_config.current.tenant_id

  sku_name                       = "standard"
  purge_protection_enabled       = true
  soft_delete_retention_days     = 90
  public_network_access_enabled  = false
  legacy_access_policies_enabled = false # Use RBAC

  network_acls = {
    default_action = "Deny"
    bypass         = "AzureServices"
  }

  # Let Azure Policy manage DNS zone groups (Landing Zone)
  private_endpoints_manage_dns_zone_group = false

  private_endpoints = {
    primary = {
      subnet_resource_id = var.pe_subnet_id
      tags               = var.tags
    }
  }

  diagnostic_settings = {}
  tags                = var.tags
  enable_telemetry    = false
}

# -----------------------------------------------------------------------------
# Storage Account
# -----------------------------------------------------------------------------
resource "azurerm_storage_account" "this" {
  name                = "${local.name_short}st${random_string.suffix.result}"
  location            = var.location
  resource_group_name = var.resource_group_name

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
  access_tier              = "Hot"

  # Landing Zone allows public access for storage
  public_network_access_enabled   = true
  allow_nested_items_to_be_public = false
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true

  network_rules {
    default_action = "Allow"
    bypass         = ["AzureServices"]
  }

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags, network_rules]
  }
}

resource "azurerm_storage_container" "default" {
  name                  = var.storage_container
  storage_account_id    = azurerm_storage_account.this.id
  container_access_type = "private"
}

# -----------------------------------------------------------------------------
# Document Intelligence (using AVM Cognitive Services)
# -----------------------------------------------------------------------------
module "document_intelligence" {
  source  = "Azure/avm-res-cognitiveservices-account/azurerm"
  version = "0.7.1"

  name                = "${var.name_prefix}-docint-${random_string.suffix.result}"
  location            = var.location
  resource_group_name = var.resource_group_name
  kind                = "FormRecognizer"
  sku_name            = "S0"

  public_network_access_enabled = false
  local_auth_enabled            = false
  custom_subdomain_name         = "${var.name_prefix}-docint-${random_string.suffix.result}"

  network_acls = {
    default_action = "Deny"
  }

  managed_identities = {
    system_assigned = true
  }

  # Let Azure Policy manage DNS zone groups (Landing Zone)
  private_endpoints_manage_dns_zone_group = false

  private_endpoints = {
    primary = {
      subnet_resource_id = var.pe_subnet_id
      tags               = var.tags
    }
  }

  diagnostic_settings = {}
  tags                = var.tags
  enable_telemetry    = false
}

# -----------------------------------------------------------------------------
# Diagnostic Settings
# -----------------------------------------------------------------------------
resource "azurerm_monitor_diagnostic_setting" "key_vault" {
  name                       = "${var.name_prefix}-kv-diag"
  target_resource_id         = module.key_vault.resource_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

resource "azurerm_monitor_diagnostic_setting" "storage_blob" {
  name                       = "${var.name_prefix}-st-blob-diag"
  target_resource_id         = "${azurerm_storage_account.this.id}/blobServices/default"
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id

  enabled_log {
    category = "StorageRead"
  }

  enabled_log {
    category = "StorageWrite"
  }

  enabled_log {
    category = "StorageDelete"
  }

  enabled_metric {
    category = "Transaction"
  }
}

resource "azurerm_monitor_diagnostic_setting" "document_intelligence" {
  name                       = "${var.name_prefix}-docint-diag"
  target_resource_id         = module.document_intelligence.resource_id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

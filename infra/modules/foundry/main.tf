# AI Foundry Hub Module
# Creates an Azure AI Foundry account (kind: AIServices) with model deployments.
# Supports OpenAI, Mistral, and Cohere models via format auto-detection.

locals {
  ai_location = coalesce(var.ai_location, var.location)

  # Auto-detect model format from name prefix
  model_format_prefixes = {
    "cohere"    = "Cohere"
    "Cohere"    = "Cohere"
    "mistral"   = "Mistral AI"
    "Mistral"   = "Mistral AI"
    "codestral" = "Mistral AI"
  }
  default_model_format = "OpenAI"

  # Build deployment map with resolved formats
  deployments = {
    for d in var.model_deployments : d.name => {
      name     = d.name
      version  = d.version
      capacity = d.capacity
      format = try(
        local.model_format_prefixes[split("-", d.name)[0]],
        local.default_model_format
      )
    }
  }
}

# -----------------------------------------------------------------------------
# AI Foundry Hub (AIServices)
# Using azapi for latest API version and full feature support
# -----------------------------------------------------------------------------
resource "azapi_resource" "ai_foundry" {
  type      = "Microsoft.CognitiveServices/accounts@2025-04-01-preview"
  name      = var.name
  location  = local.ai_location
  parent_id = var.resource_group_id

  identity {
    type = "SystemAssigned"
  }

  body = {
    kind = "AIServices"
    sku = {
      name = "S0"
    }
    properties = {
      customSubDomainName           = var.name
      publicNetworkAccess           = "Disabled"
      disableLocalAuth              = false # Some models require local auth
      allowProjectManagement        = true
      restrictOutboundNetworkAccess = false

      networkAcls = {
        defaultAction = "Deny"
        ipRules       = []
      }
    }
  }

  tags = var.tags

  response_export_values = [
    "properties.endpoint",
    "properties.endpoints",
    "identity.principalId",
    "identity.tenantId"
  ]

  schema_validation_enabled = false

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# Private Endpoint for AI Foundry
# DNS zone group is managed by Landing Zone policy
# -----------------------------------------------------------------------------
resource "azurerm_private_endpoint" "ai_foundry" {
  name                = "${var.name}-pe"
  location            = var.location
  resource_group_name = var.resource_group_name
  subnet_id           = var.pe_subnet_id

  private_service_connection {
    name                           = "${var.name}-psc"
    private_connection_resource_id = azapi_resource.ai_foundry.id
    is_manual_connection           = false
    subresource_names              = ["account"]
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags, private_dns_zone_group]
  }
}

# -----------------------------------------------------------------------------
# Model Deployments
# Created directly on the Hub (no project hierarchy for single-user)
# -----------------------------------------------------------------------------
resource "azapi_resource" "model_deployment" {
  for_each = local.deployments

  name      = each.value.name
  parent_id = azapi_resource.ai_foundry.id
  type      = "Microsoft.CognitiveServices/accounts/deployments@2025-10-01-preview"

  body = {
    properties = {
      model = {
        format  = each.value.format
        name    = each.value.name
        version = each.value.version
      }
      raiPolicyName        = "Microsoft.DefaultV2"
      versionUpgradeOption = "OnceNewDefaultVersionAvailable"
    }
    sku = {
      name     = "GlobalStandard"
      capacity = each.value.capacity
    }
  }

  schema_validation_enabled = false

  depends_on = [azapi_resource.ai_foundry]
}

# -----------------------------------------------------------------------------
# Diagnostic Settings
# -----------------------------------------------------------------------------
resource "azurerm_monitor_diagnostic_setting" "ai_foundry" {
  name                       = "${var.name}-diag"
  target_resource_id         = azapi_resource.ai_foundry.id
  log_analytics_workspace_id = var.log_analytics_workspace_id

  enabled_log {
    category_group = "allLogs"
  }

  enabled_metric {
    category = "AllMetrics"
  }
}

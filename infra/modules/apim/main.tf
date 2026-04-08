# APIM Module
# Creates an API Management instance (Developer tier, classic) with VNet injection
# and path-based routing to Document Intelligence, AI Foundry, and Storage.

# -----------------------------------------------------------------------------
# Application Insights for APIM diagnostics
# -----------------------------------------------------------------------------
resource "azurerm_application_insights" "this" {
  name                = "${var.name_prefix}-apim-appi"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = var.log_analytics_workspace_id
  application_type    = "web"

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# APIM Instance (Developer tier, classic — cheapest with VNet support)
# -----------------------------------------------------------------------------
resource "azurerm_api_management" "this" {
  name                = "${var.name_prefix}-apim"
  location            = var.location
  resource_group_name = var.resource_group_name
  publisher_name      = var.publisher_name
  publisher_email     = var.publisher_email
  sku_name            = "Developer_1"

  identity {
    type = "SystemAssigned"
  }

  # VNet injection mode: "External" for VNet connectivity, "None" to skip
  virtual_network_type = var.vnet_injection_enabled ? "External" : "None"

  # stv2 External VNet requires a dedicated public IP
  public_ip_address_id = var.vnet_injection_enabled ? var.public_ip_id : null

  dynamic "virtual_network_configuration" {
    for_each = var.vnet_injection_enabled ? [1] : []
    content {
      subnet_id = var.apim_subnet_id
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# APIM Logger (Application Insights)
# -----------------------------------------------------------------------------
resource "azurerm_api_management_logger" "appinsights" {
  name                = "applicationinsights"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  resource_id         = azurerm_application_insights.this.id

  application_insights {
    instrumentation_key = azurerm_application_insights.this.instrumentation_key
  }
}

# -----------------------------------------------------------------------------
# APIM Diagnostic Settings
# -----------------------------------------------------------------------------
resource "azurerm_api_management_diagnostic" "appinsights" {
  identifier               = "applicationinsights"
  api_management_name      = azurerm_api_management.this.name
  resource_group_name      = var.resource_group_name
  api_management_logger_id = azurerm_api_management_logger.appinsights.id

  sampling_percentage = 100.0

  frontend_request {
    body_bytes = 1024
    headers_to_log = [
      "Content-Type",
      "Authorization",
      "X-Forwarded-For",
    ]
  }

  frontend_response {
    body_bytes = 1024
    headers_to_log = [
      "Content-Type",
      "x-ms-request-id",
    ]
  }

  backend_request {
    body_bytes = 1024
    headers_to_log = [
      "Content-Type",
      "Authorization",
    ]
  }

  backend_response {
    body_bytes = 1024
    headers_to_log = [
      "Content-Type",
      "x-ms-request-id",
    ]
  }
}

# -----------------------------------------------------------------------------
# Named Values (backend endpoints)
# -----------------------------------------------------------------------------
resource "azurerm_api_management_named_value" "ai_foundry_endpoint" {
  name                = "ai-foundry-endpoint"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  display_name        = "ai-foundry-endpoint"
  value               = var.ai_foundry_endpoint
}

resource "azurerm_api_management_named_value" "docint_endpoint" {
  name                = "docint-endpoint"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  display_name        = "docint-endpoint"
  value               = var.document_intelligence_endpoint
}

resource "azurerm_api_management_named_value" "storage_endpoint" {
  name                = "storage-endpoint"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  display_name        = "storage-endpoint"
  value               = var.storage_blob_endpoint
}

# -----------------------------------------------------------------------------
# Backends
# -----------------------------------------------------------------------------
resource "azurerm_api_management_backend" "ai_foundry" {
  name                = "ai-foundry-hub"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  protocol            = "http"
  url                 = var.ai_foundry_endpoint
}

resource "azurerm_api_management_backend" "docint" {
  name                = "document-intelligence"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  protocol            = "http"
  url                 = var.document_intelligence_endpoint
}

resource "azurerm_api_management_backend" "storage" {
  name                = "storage-account"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  protocol            = "http"
  url                 = var.storage_blob_endpoint
}

# -----------------------------------------------------------------------------
# Global Policy
# -----------------------------------------------------------------------------
resource "azurerm_api_management_policy" "global" {
  api_management_id = azurerm_api_management.this.id
  xml_content       = file("${path.module}/policies/global_policy.xml")
}

# -----------------------------------------------------------------------------
# Product + Subscription
# -----------------------------------------------------------------------------
resource "azurerm_api_management_product" "default" {
  product_id            = "doc-intel"
  api_management_name   = azurerm_api_management.this.name
  resource_group_name   = var.resource_group_name
  display_name          = "Document Intelligence Services"
  description           = "Access to Document Intelligence, AI Foundry, and Storage"
  subscription_required = true
  approval_required     = false
  published             = true
}

resource "azurerm_api_management_subscription" "default" {
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  product_id          = azurerm_api_management_product.default.id
  display_name        = "Default Subscription"
  state               = "active"
  # Tracing is disabled in the live resource (likely by Landing Zone policy)
  # because trace payloads can leak request/response data. Pin to false to
  # match the enforced state and stop drift.
  allow_tracing = false
}

# -----------------------------------------------------------------------------
# API with path-based routing policy
# -----------------------------------------------------------------------------
resource "azurerm_api_management_api" "services" {
  name                = "ai-services"
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  revision            = "1"
  display_name        = "AI Services"
  path                = ""
  protocols           = ["https"]

  subscription_key_parameter_names {
    header = "api-key"
    query  = "api-key"
  }
}

resource "azurerm_api_management_product_api" "services" {
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  product_id          = azurerm_api_management_product.default.product_id
  api_name            = azurerm_api_management_api.services.name
}

# API-level policy with path-based routing
resource "azurerm_api_management_api_policy" "services" {
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  api_name            = azurerm_api_management_api.services.name

  xml_content = templatefile("${path.module}/policies/api_policy.xml.tftpl", {
    ai_foundry_endpoint = var.ai_foundry_endpoint
    docint_endpoint     = var.document_intelligence_endpoint
    storage_endpoint    = var.storage_blob_endpoint
  })
}

# Wildcard operations for all HTTP methods
locals {
  http_methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]
}

resource "azurerm_api_management_api_operation" "wildcard" {
  for_each = toset(local.http_methods)

  operation_id        = "wildcard-${lower(each.value)}"
  api_name            = azurerm_api_management_api.services.name
  api_management_name = azurerm_api_management.this.name
  resource_group_name = var.resource_group_name
  display_name        = "${each.value} Wildcard"
  method              = each.value
  url_template        = "/*"
}

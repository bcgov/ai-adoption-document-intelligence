# Network Module
# Creates subnets and NSGs in an existing VNet for private endpoints and APIM.
# Uses azapi_resource for subnet creation (Landing Zone requires NSG at creation time).

# -----------------------------------------------------------------------------
# Data source: existing VNet
# -----------------------------------------------------------------------------
data "azurerm_virtual_network" "this" {
  name                = var.vnet_name
  resource_group_name = var.vnet_resource_group
}

# -----------------------------------------------------------------------------
# Private Endpoint Subnet + NSG
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "pe" {
  name                = "${var.name_prefix}-pe-nsg"
  location            = var.location
  resource_group_name = var.vnet_resource_group

  # Inbound: allow VNet address spaces to reach PE subnet
  dynamic "security_rule" {
    for_each = data.azurerm_virtual_network.this.address_space
    content {
      name                       = "AllowInboundFromVNet-${replace(replace(security_rule.value, ".", "-"), "/", "-")}"
      priority                   = 100 + index(data.azurerm_virtual_network.this.address_space, security_rule.value)
      direction                  = "Inbound"
      access                     = "Allow"
      protocol                   = "*"
      source_address_prefix      = security_rule.value
      destination_address_prefix = var.pe_subnet_cidr
      source_port_range          = "*"
      destination_port_range     = "*"
    }
  }

  # Outbound: PE subnet to VNet address spaces
  dynamic "security_rule" {
    for_each = data.azurerm_virtual_network.this.address_space
    content {
      name                       = "AllowOutboundToVNet-${replace(replace(security_rule.value, ".", "-"), "/", "-")}"
      priority                   = 200 + index(data.azurerm_virtual_network.this.address_space, security_rule.value)
      direction                  = "Outbound"
      access                     = "Allow"
      protocol                   = "*"
      source_address_prefix      = var.pe_subnet_cidr
      destination_address_prefix = security_rule.value
      source_port_range          = "*"
      destination_port_range     = "*"
    }
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# Source/tools VNet NSG rules (only when source_vnet_address_space is provided)
resource "azurerm_network_security_rule" "pe_inbound_source_vnet" {
  count = var.source_vnet_address_space != "" ? 1 : 0

  name                        = "AllowInboundFromSourceVNet"
  priority                    = 300
  direction                   = "Inbound"
  access                      = "Allow"
  protocol                    = "*"
  source_address_prefix       = var.source_vnet_address_space
  destination_address_prefix  = var.pe_subnet_cidr
  source_port_range           = "*"
  destination_port_range      = "*"
  resource_group_name         = var.vnet_resource_group
  network_security_group_name = azurerm_network_security_group.pe.name
}

resource "azurerm_network_security_rule" "pe_outbound_source_vnet" {
  count = var.source_vnet_address_space != "" ? 1 : 0

  name                        = "AllowOutboundToSourceVNet"
  priority                    = 301
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "*"
  source_address_prefix       = var.pe_subnet_cidr
  destination_address_prefix  = var.source_vnet_address_space
  source_port_range           = "*"
  destination_port_range      = "*"
  resource_group_name         = var.vnet_resource_group
  network_security_group_name = azurerm_network_security_group.pe.name
}

# PE subnet via azapi (Landing Zone requires NSG association at creation time)
resource "azapi_resource" "pe_subnet" {
  type      = "Microsoft.Network/virtualNetworks/subnets@2023-04-01"
  name      = "${var.name_prefix}-pe-subnet"
  parent_id = data.azurerm_virtual_network.this.id
  locks     = [data.azurerm_virtual_network.this.id]

  body = {
    properties = {
      addressPrefix = var.pe_subnet_cidr

      networkSecurityGroup = {
        id = azurerm_network_security_group.pe.id
      }

      privateEndpointNetworkPolicies = "Disabled"
    }
  }

  response_export_values = ["*"]
}

# -----------------------------------------------------------------------------
# APIM Subnet + NSG
# Matches working bcgov APIM NSG in dbc1c3-dev subscription
# -----------------------------------------------------------------------------
resource "azurerm_network_security_group" "apim" {
  name                = "${var.name_prefix}-apim-nsg"
  location            = var.location
  resource_group_name = var.vnet_resource_group

  # --- Inbound Rules ---

  # Client HTTP access (port 80)
  security_rule {
    name                       = "Client_communication_to_API_Management"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "Internet"
    destination_address_prefix = "VirtualNetwork"
  }

  # Client HTTPS access (port 443)
  security_rule {
    name                       = "Secure_Client_communication_to_API_Management"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "Internet"
    destination_address_prefix = "VirtualNetwork"
  }

  # APIM management plane (portal + PowerShell)
  security_rule {
    name                       = "Management_endpoint_for_Azure_portal_and_Powershell"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "3443"
    source_address_prefix      = "ApiManagement"
    destination_address_prefix = "VirtualNetwork"
  }

  # Redis cache dependency
  security_rule {
    name                       = "Dependency_on_Redis_Cache"
    priority                   = 130
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "6381-6383"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Rate limit sync inbound
  security_rule {
    name                       = "Dependency_to_sync_Rate_Limit_Inbound"
    priority                   = 135
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4290"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Azure Load Balancer health probes
  security_rule {
    name                       = "Azure_Infrastructure_Load_Balancer"
    priority                   = 180
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "6390"
    source_address_prefix      = "AzureLoadBalancer"
    destination_address_prefix = "VirtualNetwork"
  }

  # --- Outbound Rules ---

  # Azure Storage (config, logs)
  security_rule {
    name                       = "Dependency_on_Azure_Storage"
    priority                   = 100
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Storage"
  }

  # Azure SQL
  security_rule {
    name                       = "Dependency_on_Azure_SQL"
    priority                   = 140
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "1433"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Sql"
  }

  # Event Hub (logging policy)
  security_rule {
    name                       = "Dependency_for_Log_to_event_Hub_policy"
    priority                   = 150
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "5671"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "EventHub"
  }

  # Redis cache outbound
  security_rule {
    name                       = "Dependency_on_Redis_Cache_outbound"
    priority                   = 160
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "6381-6383"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Rate limit sync outbound
  security_rule {
    name                       = "Depenedency_To_sync_RateLimit_Outbound"
    priority                   = 165
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "4290"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # VNet to VNet on port 443 (CRITICAL: reach PE-backed services)
  security_rule {
    name                       = "AllowVirtualNetworkOutbound443"
    priority                   = 120
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }

  # Azure File Share for GIT
  security_rule {
    name                       = "Dependency_on_Azure_File_Share_for_GIT"
    priority                   = 170
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "445"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Storage"
  }

  # Diagnostics and metrics
  security_rule {
    name                       = "Publish_DiagnosticLogs_And_Metrics"
    priority                   = 185
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "AzureMonitor"
  }

  # SMTP relay for email notifications
  security_rule {
    name                       = "Connect_To_SMTP_Relay_For_SendingEmails"
    priority                   = 190
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Internet"
  }

  # Azure AD (managed identity tokens)
  security_rule {
    name                       = "Authenticate_To_Azure_Active_Directory"
    priority                   = 200
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "AzureActiveDirectory"
  }

  # Azure Cloud (monitoring, management)
  security_rule {
    name                       = "Publish_Monitoring_Logs"
    priority                   = 300
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "AzureCloud"
  }

  # Deny all other internet outbound
  security_rule {
    name                       = "Deny_All_Internet_Outbound"
    priority                   = 999
    direction                  = "Outbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "Internet"
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# -----------------------------------------------------------------------------
# APIM Route Table
# Required in VWAN spoke VNets to ensure APIM management and data plane traffic
# goes directly to Internet, bypassing the VWAN hub/firewall.
# -----------------------------------------------------------------------------
resource "azurerm_route_table" "apim" {
  name                = "${var.name_prefix}-apim-rt"
  location            = var.location
  resource_group_name = var.resource_group_name

  route {
    name           = "apimManagementEndPointInternet"
    address_prefix = "ApiManagement"
    next_hop_type  = "Internet"
  }

  route {
    name           = "apimDataPlaneToInternet"
    address_prefix = "0.0.0.0/0"
    next_hop_type  = "Internet"
  }

  tags = var.tags

  lifecycle {
    ignore_changes = [tags]
  }
}

# APIM subnet (classic Developer tier uses VNet injection, not delegation)
resource "azapi_resource" "apim_subnet" {
  type      = "Microsoft.Network/virtualNetworks/subnets@2023-04-01"
  name      = "${var.name_prefix}-apim-subnet"
  parent_id = data.azurerm_virtual_network.this.id
  locks     = [data.azurerm_virtual_network.this.id]

  body = {
    properties = {
      addressPrefix = var.apim_subnet_cidr

      networkSecurityGroup = {
        id = azurerm_network_security_group.apim.id
      }

      routeTable = {
        id = azurerm_route_table.apim.id
      }

      # Service endpoints required for APIM VNet injection
      serviceEndpoints = [
        { service = "Microsoft.Storage" },
        { service = "Microsoft.Sql" },
        { service = "Microsoft.EventHub" },
        { service = "Microsoft.KeyVault" },
      ]
    }
  }

  response_export_values = ["*"]

  depends_on = [azapi_resource.pe_subnet]
}
